/**
 * FICHE D'UN ACTE (fichier 31) — maquette « Officier — Fiche d'un acte »
 *
 * - le parcours de l'acte : enregistré → transmis → payé (ou exonéré) →
 *   délivré → scanné, avec les heures et les noms (ou « annulé ») ;
 * - les informations de sa fiche de détails ;
 * - le document scanné qui fait foi et ses versions précédentes (fichier 33) ;
 * - ce que l'officier peut encore faire selon le statut (règles de l'étape 6,
 *   migration 20) : corriger la fiche, corriger l'orthographe d'un nom,
 *   transmettre, marquer « délivré », annuler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireActe, type ActeComplet } from "./actes";
import { formaterTaille } from "./archivage";
import { lireScans, type VersionScan } from "./scans";
import { libelleStatut } from "./accueil-officier";
import type { Devise } from "./charte";
import { heureUvira } from "./taux";
import { aujourdhuiUvira, formaterDate, formaterMontant } from "./tarifs";

export interface Recu {
  id: string;
  numero_recu: string;
  encaisse_le: string;
  encaisse_par: string | null;
  devise_recue: Devise;
  montant_recu: number;
  taux_applique: number | null;
  montant_equivalent_cdf: number;
  statut: "valide" | "annule";
}

export interface Exoneration {
  motif: string;
  accorde_le: string;
  accorde_par: string | null;
}

export interface DocumentScanne {
  chemin_stockage: string;
  version: number;
  importe_le: string;
  nb_pages: number | null;
}

export interface FicheActe {
  acte: ActeComplet & {
    transmis_le: string | null;
    cree_par: string | null;
    delivre_par: string | null;
    renvoye_par: string | null;
    motif_correction: string | null;
    corrige_le: string | null;
    corrige_par: string | null;
  };
  recu: Recu | null;
  exoneration: Exoneration | null;
  document: DocumentScanne | null;
  /** Toutes les versions du scan, la plus récente (celle qui fait foi) d'abord. */
  scans: VersionScan[];
  /** Noms des agents de l'entité (et de l'administrateur), par identifiant. */
  noms: Record<string, string>;
}

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

export async function lireFicheActe(supabase: SupabaseClient, id: string): Promise<FicheActe | null> {
  const acte = await lireActe(supabase, id);
  if (!acte) return null;
  const [recu, exoneration, scans, agents] = await Promise.all([
    supabase.from("recus").select("id, numero_recu, encaisse_le, encaisse_par, devise_recue, montant_recu, taux_applique, montant_equivalent_cdf, statut")
      // Un acte peut avoir des reçus annulés (fichier 40) : le plus récent compte
      .eq("acte_id", acte.id).order("encaisse_le", { ascending: false }).limit(1).maybeSingle<Recu>(),
    supabase.from("exonerations").select("motif, accorde_le, accorde_par").eq("acte_id", acte.id).maybeSingle<Exoneration>(),
    lireScans(supabase, acte.id),
    supabase.rpc("agents_de_mon_entite"),
  ]);
  for (const [r, quoi] of [[recu, "du reçu"], [exoneration, "de l'exonération"], [agents, "des agents"]] as const) {
    if (r.error) throw new Error(`Lecture ${quoi} impossible : ${r.error.message}`);
  }
  return {
    acte: acte as FicheActe["acte"],
    recu: recu.data
      ? { ...recu.data, montant_recu: Number(recu.data.montant_recu), montant_equivalent_cdf: Number(recu.data.montant_equivalent_cdf),
          taux_applique: recu.data.taux_applique == null ? null : Number(recu.data.taux_applique) }
      : null,
    exoneration: exoneration.data,
    document: scans[0]
      ? { chemin_stockage: scans[0].chemin_stockage, version: scans[0].version, importe_le: scans[0].importe_le, nb_pages: scans[0].nb_pages }
      : null,
    scans,
    noms: Object.fromEntries(((agents.data ?? []) as { id: string; nom_complet: string }[]).map((a) => [a.id, a.nom_complet])),
  };
}

// ---------------------------------------------------------------------
// Parcours
// ---------------------------------------------------------------------

export interface EtapeParcours {
  libelle: string;
  details: string[];
  etat: "fait" | "a-venir" | "annule" | "scanne";
}

/** « 13/10 · 08 h 12 » (la date seulement si ce n'est pas aujourd'hui… et toujours pour l'enregistrement, comme la maquette). */
function quand(horodatage: string, avecDate: boolean, aujourdhui: string): string {
  const jour = aujourdhuiUvira(new Date(horodatage));
  const date = avecDate || jour !== aujourdhui ? `${formaterDate(jour).slice(0, jour.slice(0, 4) === aujourdhui.slice(0, 4) ? 5 : 10)} · ` : "";
  return `${date}${heureUvira(horodatage)}`;
}

export function parcoursActe(f: FicheActe, aujourdhui = aujourdhuiUvira()): EtapeParcours[] {
  const { acte } = f;
  const nom = (id: string | null) => (id ? f.noms[id] : undefined);
  const avec = (...morceaux: (string | undefined | null)[]) => morceaux.filter(Boolean).join(" · ");
  const etapes: EtapeParcours[] = [];

  if (acte.origine === "archive_ancienne") {
    etapes.push({ libelle: "Ancien registre", details: [avec(`acte de ${acte.annee}`, acte.numero_registre ? `reg. n° ${acte.numero_registre}` : null)], etat: "fait" });
  } else {
    etapes.push({ libelle: "Enregistré", details: [avec(quand(acte.cree_le, true, aujourdhui), nom(acte.cree_par))], etat: "fait" });
    etapes.push(
      acte.transmis_le
        ? { libelle: "Transmis au Caissier", details: [quand(acte.transmis_le, false, aujourdhui)], etat: "fait" }
        : { libelle: "Transmis au Caissier", details: [], etat: "a-venir" },
    );
    if (f.exoneration) {
      etapes.push({ libelle: "Exonéré", details: [avec(quand(f.exoneration.accorde_le, false, aujourdhui), nom(f.exoneration.accorde_par)), `Motif : ${f.exoneration.motif}`], etat: "fait" });
    } else if (f.recu) {
      etapes.push({
        libelle: f.recu.statut === "annule" ? "Payé (reçu annulé)" : "Payé",
        details: [avec(quand(f.recu.encaisse_le, false, aujourdhui), nom(f.recu.encaisse_par)), f.recu.numero_recu],
        etat: "fait",
      });
    } else {
      etapes.push({ libelle: "Payé", details: [], etat: "a-venir" });
    }
    etapes.push(
      acte.delivre_le
        ? { libelle: "Délivré", details: [avec(quand(acte.delivre_le, false, aujourdhui), nom(acte.delivre_par))], etat: "fait" }
        : { libelle: "Délivré", details: [], etat: "a-venir" },
    );
  }
  etapes.push(
    f.document
      ? { libelle: "Scanné", details: [avec(quand(f.document.importe_le, false, aujourdhui), `version ${f.document.version}`)], etat: "scanne" }
      : { libelle: "Scanné", details: [], etat: "a-venir" },
  );
  if (acte.statut === "annule") {
    etapes.push({ libelle: "Annulé", details: [avec(acte.annule_le ? quand(acte.annule_le, true, aujourdhui) : null), `Motif : ${acte.motif_annulation ?? "—"}`], etat: "annule" });
  }
  return etapes;
}

// ---------------------------------------------------------------------
// Informations
// ---------------------------------------------------------------------

const sexe = (v: unknown) => (v === "M" ? "Masculin" : v === "F" ? "Féminin" : null);
const date = (v: unknown) => (typeof v === "string" && v ? formaterDate(v) : null);
const texte = (v: unknown) => (v == null || v === "" ? null : String(v));
const ensemble = (...m: (string | null)[]) => m.filter(Boolean).join(", ") || null;

export function informationsActe(f: FicheActe): [string, string][] {
  const { acte } = f;
  const d = acte.details ?? {};
  const lignes: [string, string | null][] = [];
  switch (acte.type.modele_fiche) {
    case "naissance":
      lignes.push(["Titulaire", acte.titulaire_nom], ["Sexe", sexe(d.sexe)], ["Date et lieu de naissance", ensemble(date(d.date_naissance), texte(d.lieu_naissance))],
        ["Père", texte(d.nom_pere)], ["Mère", texte(d.nom_mere)]);
      break;
    case "mariage":
      lignes.push(["Époux", acte.titulaire_nom], ["Épouse", acte.titulaire_2_nom], ["Date et lieu de célébration", ensemble(date(d.date_celebration), texte(d.lieu_celebration))],
        ["Témoins", texte(d.temoins)]);
      break;
    case "deces":
      lignes.push(["Défunt", acte.titulaire_nom], ["Sexe", sexe(d.sexe)], ["Date et lieu du décès", ensemble(date(d.date_deces), texte(d.lieu_deces))],
        ["Âge au décès", d.age_au_deces == null ? null : `${d.age_au_deces} ans`], ["Déclarant", texte(d.declarant_nom)]);
      break;
    default:
      lignes.push(["Titulaire", acte.titulaire_nom]);
  }
  if (acte.numero_registre) lignes.push(["N° dans le registre papier", acte.numero_registre]);
  lignes.push(["Demandeur", ensemble(acte.demandeur_nom, acte.demandeur_telephone)?.replace(", ", " · ") ?? null]);
  lignes.push(["Catégorie", acte.categorie === "etranger" ? "Étranger" : "National"]);
  if (acte.montant_du != null && acte.devise_du) {
    const du = formaterMontant(acte.montant_du, acte.devise_du);
    const r = f.recu?.statut === "valide" ? f.recu : null;
    const paye = r
      ? r.devise_recue === acte.devise_du
        ? " — payé"
        : ` — payé ${formaterMontant(r.montant_recu, r.devise_recue)} (taux ${formaterMontant(r.taux_applique ?? 0, "CDF").replace(" FC", "")})`
      : f.exoneration
        ? " — exonéré"
        : "";
    lignes.push(["Montant", `${du}${paye}`]);
  } else if (acte.origine === "archive_ancienne") {
    lignes.push(["Montant", "Sans montant (ancien registre)"]);
  }
  lignes.push(["Observations", texte(acte.observations)]);
  if (acte.motif_correction && acte.corrige_le) {
    lignes.push(["Dernière correction d'un nom", `${formaterDate(aujourdhuiUvira(new Date(acte.corrige_le)))} — ${acte.motif_correction}`]);
  }
  return lignes.filter((l): l is [string, string] => l[1] != null && l[1] !== "");
}

// ---------------------------------------------------------------------
// Ce que l'officier peut faire
// ---------------------------------------------------------------------

export interface ActionsPossibles {
  corrigerFiche: boolean;
  transmettre: boolean;
  corrigerNom: boolean;
  delivrer: boolean;
  annuler: boolean;
  /** Pourquoi « Annuler » n'est pas proposé (acte payé). */
  annulationParLaCaisse: boolean;
  /** Joindre le scan de l'acte signé (payé, exonéré ou délivré, pas encore scanné). */
  scanner: boolean;
  /** Nouvelle version du scan, avec motif. */
  refaireScan: boolean;
}

export function actionsPossibles(f: FicheActe): ActionsPossibles {
  const s = f.acte.statut;
  const paye = s === "paye" || s === "exonere" || s === "delivre";
  return {
    corrigerFiche: s === "enregistre",
    transmettre: s === "enregistre",
    corrigerNom: paye,
    delivrer: s === "paye" || s === "exonere",
    annuler: s === "enregistre" || s === "en_attente_paiement",
    annulationParLaCaisse: paye,
    scanner: paye && f.document == null,
    refaireScan: paye && f.document != null,
  };
}

/** « Délivré et scanné », « Payé »… */
export function statutAffiche(f: FicheActe): string {
  return libelleStatut(f.acte.statut, f.document != null);
}

/** « Version 2 · 3 pages · 210 Ko · 14/10 · 15 h 02 · Bahati Mugisho » */
export function resumeVersion(v: VersionScan, noms: Record<string, string>, aujourdhui = aujourdhuiUvira()): string {
  return [
    `Version ${v.version}`,
    v.nb_pages ? `${v.nb_pages} page${v.nb_pages > 1 ? "s" : ""}` : null,
    formaterTaille(v.taille_octets),
    quand(v.importe_le, true, aujourdhui),
    v.importe_par ? noms[v.importe_par] : null,
  ].filter(Boolean).join(" · ");
}

/** Où le scan sera rangé : « MUL/2026/MUL-EXNAIS-2026-000123.pdf ». */
export function cheminPrevu(f: FicheActe): string {
  return `${f.acte.entite.code}/${f.acte.annee}/${f.acte.identifiant}.pdf`;
}
