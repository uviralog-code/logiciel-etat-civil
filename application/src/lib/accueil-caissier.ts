/**
 * ACCUEIL DU CAISSIER (fichier 37) — maquette « Caissier — Accueil »
 *
 * - les chiffres du jour : encaissé en dollars, en francs, total en
 *   équivalent FC, reçus émis (dont annulés) — calculés par la base
 *   (rapport_synthese, fichier 10 : les mêmes chiffres que les rapports) ;
 * - la file « À encaisser » : actes transmis par l'Officier, le plus
 *   ancien en haut (premier transmis, premier servi) ;
 * - les derniers reçus du jour ;
 * - l'état de la journée (ouverte ou clôturée).
 *
 * « Renvoyer à l'Officier » : un motif courant choisi dans une liste, plus
 * une précision (obligatoire pour « Autre motif »).
 *
 * L'écran se remet à jour tout seul toutes les 15 secondes (décision du
 * fichier 37), et dès que le Caissier revient sur l'onglet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TypeResume } from "./accueil-officier";
import type { Devise, StatutActe } from "./charte";
import { nettoyerNom } from "./actes";
import type { EtatTaux } from "./taux";
import { heureUvira } from "./taux";
import { aujourdhuiUvira, formaterDate, type Categorie } from "./tarifs";

/** Remise à jour automatique de l'accueil. */
export const INTERVALLE_ACTUALISATION_MS = 15_000;
const NOMBRE_DERNIERS_RECUS = 5;

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

export interface ActeAEncaisser {
  id: string;
  identifiant: string;
  type: TypeResume;
  /** « Kasongo Jean et Mapendo Grace » pour un mariage. */
  titulaire: string;
  demandeur: string | null;
  categorie: Categorie;
  montant: number;
  devise: Devise;
  transmisLe: string | null;
}

export interface RecuResume {
  id: string;
  numero: string;
  acteIdentifiant: string;
  acteTitulaire: string;
  /** Statut de l'acte : un acte délivré ne revient pas dans la file (fichier 40). */
  acteStatut: StatutActe | null;
  montant: number;
  devise: Devise;
  statut: "valide" | "annule";
  motifAnnulation: string | null;
  encaisseLe: string;
}

export interface ChiffresDuJour {
  usd: number;
  cdf: number;
  equivalentCdf: number;
  /** Reçus émis aujourd'hui, annulés compris (comme la maquette : « 7, dont 1 annulé »). */
  recusEmis: number;
  recusAnnules: number;
  exonerations: number;
}

export interface AccueilCaissier {
  chiffres: ChiffresDuJour;
  aEncaisser: ActeAEncaisser[];
  derniersRecus: RecuResume[];
  /** Heure de la clôture, si la journée est déjà clôturée. */
  clotureLe: string | null;
}

type LigneActe = {
  id: string;
  identifiant: string;
  titulaire_nom: string;
  titulaire_2_nom: string | null;
  demandeur_nom: string | null;
  categorie: Categorie;
  montant_du: number | string;
  devise_du: Devise;
  transmis_le: string | null;
  cree_le: string;
  type: TypeResume;
};

type LigneRecu = {
  id: string;
  numero_recu: string;
  montant_recu: number | string;
  devise_recue: Devise;
  statut: "valide" | "annule";
  motif_annulation: string | null;
  encaisse_le: string;
  acte: { identifiant: string; titulaire_nom: string; statut: StatutActe } | null;
};

type LigneSynthese = {
  recettes_usd: number | string;
  recettes_cdf: number | string;
  recettes_equivalent_cdf: number | string;
  recus_valides: number | string;
  recus_annules: number | string;
  exonerations: number | string;
};

function verifier<T>(r: { data: T | null; error: { message: string } | null }, quoi: string): T {
  if (r.error) throw new Error(`Lecture ${quoi} impossible : ${r.error.message}`);
  return r.data as T;
}

/** Tout ce que montre l'accueil du caissier, pour son entité (la base ne lui montre que celle-ci). */
export async function lireAccueilCaissier(supabase: SupabaseClient, entiteId: string, aujourdhui: string): Promise<AccueilCaissier> {
  const [file, synthese, recus, cloture] = await Promise.all([
    supabase
      .from("actes")
      .select(
        "id, identifiant, titulaire_nom, titulaire_2_nom, demandeur_nom, categorie, montant_du, devise_du, transmis_le, cree_le, type:types_actes(code, libelle, famille, couleur)",
      )
      .eq("entite_id", entiteId)
      .eq("statut", "en_attente_paiement")
      // Premier transmis, premier servi
      .order("transmis_le", { ascending: true, nullsFirst: true })
      .order("cree_le", { ascending: true })
      .returns<LigneActe[]>(),
    supabase.rpc("rapport_synthese", { p_periodicite: "jour", p_date: aujourdhui, p_entite: entiteId }),
    supabase
      .from("recus")
      .select("id, numero_recu, montant_recu, devise_recue, statut, motif_annulation, encaisse_le, acte:actes(identifiant, titulaire_nom, statut)")
      .eq("entite_id", entiteId)
      .eq("journee", aujourdhui)
      .order("encaisse_le", { ascending: false })
      .limit(NOMBRE_DERNIERS_RECUS)
      .returns<LigneRecu[]>(),
    supabase.from("clotures_caisse").select("cloture_le").eq("entite_id", entiteId).eq("journee", aujourdhui).maybeSingle<{ cloture_le: string }>(),
  ]);

  const s = ((verifier(synthese, "des chiffres du jour") ?? []) as LigneSynthese[])[0];
  const valides = Number(s?.recus_valides ?? 0);
  const annules = Number(s?.recus_annules ?? 0);
  return {
    chiffres: {
      usd: Number(s?.recettes_usd ?? 0),
      cdf: Number(s?.recettes_cdf ?? 0),
      equivalentCdf: Number(s?.recettes_equivalent_cdf ?? 0),
      recusEmis: valides + annules,
      recusAnnules: annules,
      exonerations: Number(s?.exonerations ?? 0),
    },
    aEncaisser: (verifier(file, "des actes à encaisser") ?? []).map((a) => ({
      id: a.id,
      identifiant: a.identifiant,
      type: a.type,
      titulaire: a.titulaire_2_nom ? `${a.titulaire_nom} et ${a.titulaire_2_nom}` : a.titulaire_nom,
      demandeur: a.demandeur_nom,
      categorie: a.categorie,
      montant: Number(a.montant_du),
      devise: a.devise_du,
      transmisLe: a.transmis_le,
    })),
    derniersRecus: (verifier(recus, "des reçus du jour") ?? []).map((r) => ({
      id: r.id,
      numero: r.numero_recu,
      acteIdentifiant: r.acte?.identifiant ?? "",
      acteTitulaire: r.acte?.titulaire_nom ?? "",
      acteStatut: r.acte?.statut ?? null,
      montant: Number(r.montant_recu),
      devise: r.devise_recue,
      statut: r.statut,
      motifAnnulation: r.motif_annulation,
      encaisseLe: r.encaisse_le,
    })),
    clotureLe: verifier(cloture, "de la clôture")?.cloture_le ?? null,
  };
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

/** « 08 h 15 » si l'acte a été transmis aujourd'hui, sinon « 13/10/2026 · 16 h 40 ». */
export function momentTransmission(transmisLe: string | null, aujourdhui: string): string {
  if (!transmisLe) return "—";
  const jour = aujourdhuiUvira(new Date(transmisLe));
  return jour === aujourdhui ? heureUvira(transmisLe) : `${formaterDate(jour)} · ${heureUvira(transmisLe)}`;
}

/** « (3 actes transmis par l'Officier) » */
export function texteFile(nombre: number): string {
  if (nombre === 0) return "(aucun acte en attente)";
  return nombre === 1 ? "(1 acte transmis par l'Officier)" : `(${nombre} actes transmis par l'Officier)`;
}

/** « dont 1 annulé », « dont 2 annulés » ; vide sinon. */
export function texteAnnules(nombre: number): string {
  if (nombre === 0) return "";
  return nombre === 1 ? "dont 1 annulé" : `dont ${nombre} annulés`;
}

/** En-tête : « Mardi 13 octobre 2026 · journée de caisse ouverte » (ou « clôturée à 17 h 05 »). */
export function etatJournee(clotureLe: string | null): string {
  return clotureLe ? `journée de caisse clôturée à ${heureUvira(clotureLe)}` : "journée de caisse ouverte";
}

/**
 * Pourquoi un acte ne peut pas être encaissé maintenant (null : il peut l'être).
 * Mêmes règles que la base : journée clôturée verrouillée (fichier 05) ; un acte
 * en dollars demande un taux (le dernier saisi s'applique encore, fichier 26).
 */
export function obstacleEncaissement(acte: Pick<ActeAEncaisser, "devise">, taux: EtatTaux, clotureLe: string | null): string | null {
  if (clotureLe) return "La caisse est clôturée pour aujourd'hui : l'usager paiera demain.";
  if (acte.devise === "USD" && taux.type === "aucun") return "Saisissez d'abord le taux du jour : cet acte est en dollars.";
  return null;
}

// ---------------------------------------------------------------------
// Renvoi à l'Officier
// ---------------------------------------------------------------------

/** Les motifs courants (décision du fichier 37) ; le dernier exige une précision. */
export const MOTIFS_RENVOI = [
  "Nom mal orthographié",
  "Mauvais type d'acte",
  "Mauvaise catégorie (national / étranger)",
  "Erreur de date",
  "Pièce justificative manquante",
  "Autre motif",
] as const;
export type MotifRenvoi = (typeof MOTIFS_RENVOI)[number];
export const AUTRE_MOTIF: MotifRenvoi = "Autre motif";
/** Longueur maximale de la précision (le motif complet reste sous 300 caractères). */
export const PRECISION_MAX = 240;

export const MESSAGES_RENVOI = {
  motif: "Choisissez le motif du renvoi.",
  precisionAutre: "Écrivez le motif du renvoi (3 caractères au moins), pour que l'Officier sache quoi corriger.",
  precisionLongue: `La précision ne doit pas dépasser ${PRECISION_MAX} caractères.`,
  plusEnAttente: "Cet acte n'est plus en attente de paiement (déjà encaissé, exonéré ou renvoyé) : la liste a été remise à jour.",
  introuvable: "Acte introuvable.",
  refus: "Action réservée au caissier de l'entité.",
} as const;

export type ResultatRenvoi = { ok: true; identifiant: string } | { ok: false; message: string; champ?: "motif" | "precision" };

/**
 * Motif enregistré sur l'acte, lu par l'Officier sur son accueil :
 * « Nom mal orthographié — Mapendo s'écrit avec un seul p ».
 */
export function composerMotifRenvoi(motif: string, precision: string): { ok: true; motif: string } | Extract<ResultatRenvoi, { ok: false }> {
  if (!(MOTIFS_RENVOI as readonly string[]).includes(motif)) return { ok: false, message: MESSAGES_RENVOI.motif, champ: "motif" };
  const p = nettoyerNom(precision);
  if (p.length > PRECISION_MAX) return { ok: false, message: MESSAGES_RENVOI.precisionLongue, champ: "precision" };
  if (motif === AUTRE_MOTIF) {
    if (p.length < 3) return { ok: false, message: MESSAGES_RENVOI.precisionAutre, champ: "precision" };
    return { ok: true, motif: p };
  }
  return { ok: true, motif: p ? `${motif} — ${p}` : motif };
}

const idValable = (id: string) => /^[0-9a-f-]{36}$/i.test(id ?? "");

/** Renvoie l'acte à l'Officier (fonction de la base, fichier 12) : il repasse « enregistré », avec le motif. */
export async function renvoyerActe(supabase: SupabaseClient, acteId: string, motif: string, precision: string): Promise<ResultatRenvoi> {
  if (!idValable(acteId)) return { ok: false, message: MESSAGES_RENVOI.introuvable };
  const m = composerMotifRenvoi(motif, precision);
  if (!m.ok) return m;
  const { data, error } = await supabase.rpc("renvoyer_a_l_officier", { p_acte: acteId, p_motif: m.motif }).single<{ identifiant: string }>();
  if (error) {
    if (error.code === "42501") return { ok: false, message: MESSAGES_RENVOI.refus };
    // Encaissé ou renvoyé entre-temps (par exemple depuis un autre ordinateur)
    if (/en attente de paiement/.test(error.message)) return { ok: false, message: MESSAGES_RENVOI.plusEnAttente };
    if (error.code === "P0001") return { ok: false, message: error.message };
    return { ok: false, message: `La base de données a refusé le renvoi : ${error.message}` };
  }
  return { ok: true, identifiant: data.identifiant };
}

// ---------------------------------------------------------------------
// Retour à l'accueil après un geste fait sur l'écran d'encaissement (fichier 38)
// ---------------------------------------------------------------------

const ID_ACTE = /^[A-Z]{3}-[A-Z0-9]{2,12}-\d{4}-\d{6}$/;

/** « ?exonere=MUL-…» ou « ?renvoye=MUL-… » → message affiché en haut de l'accueil. */
export function annonceRetour(p: Record<string, string | string[] | undefined>): string | null {
  const valeur = (cle: string) => {
    const v = p[cle];
    return typeof v === "string" && ID_ACTE.test(v) ? v : null;
  };
  const exonere = valeur("exonere");
  if (exonere) return `${exonere} a été exonéré : il est prêt à être délivré, sans paiement.`;
  const renvoye = valeur("renvoye");
  if (renvoye) return `${renvoye} a été renvoyé à l'Officier pour correction.`;
  return null;
}
