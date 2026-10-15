/**
 * ACCUEIL DE L'OFFICIER (fichier 30) — maquette « Officier — Accueil »
 *
 * - quatre compteurs : enregistrés aujourd'hui, en attente de paiement,
 *   renvoyés pour correction, payés à scanner ;
 * - les actes payés (ou exonérés) pas encore scannés : à faire avant la
 *   clôture de caisse, sinon l'oubli est signalé à l'administrateur ;
 * - les actes renvoyés par le Caissier, avec leur motif ;
 * - les derniers actes du jour et leur statut.
 *
 * Tout est lu avec les droits de l'officier : la base ne lui montre que son entité.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUTS, type FamilleActe, type StatutActe } from "./charte";
import type { Categorie } from "./tarifs";

export interface TypeResume {
  code: string;
  libelle: string;
  famille: FamilleActe;
  couleur: string | null;
}

export interface ActeAScanner {
  id: string;
  identifiant: string;
  type: TypeResume;
  titulaire: string;
  categorie: Categorie;
  /** Heure du paiement (ou de l'exonération). */
  payeLe: string | null;
  /** Journée de caisse du paiement. */
  journee: string | null;
  /** Payé un jour précédent : l'oubli a déjà été signalé à la clôture. */
  enRetard: boolean;
}

export interface ActeRenvoye {
  id: string;
  identifiant: string;
  titulaire: string;
  renvoyeLe: string | null;
  /** Nom du Caissier qui a renvoyé l'acte. */
  par: string | null;
  motif: string;
}

export interface ActeDuJour {
  id: string;
  identifiant: string;
  statut: StatutActe;
  scanne: boolean;
}

export interface AccueilOfficier {
  compteurs: { enregistres: number; enAttente: number; renvoyes: number; aScanner: number };
  aScanner: ActeAScanner[];
  renvoyes: ActeRenvoye[];
  derniers: ActeDuJour[];
}

/** « Délivré et scanné », « Payé », « En attente de paiement »… */
export function libelleStatut(statut: StatutActe, scanne: boolean): string {
  const libelle = STATUTS[statut].libelle;
  return scanne && statut !== "annule" ? `${libelle} et scanné` : libelle;
}

/** « Bahati Mugisho » → « Bahati » (comme la maquette : « Bonjour Bahati »). */
export function prenomAffiche(nomComplet: string): string {
  return nomComplet.trim().split(/\s+/)[0] ?? nomComplet;
}

const NOMBRE_DERNIERS = 8;

type LigneActe = {
  id: string;
  identifiant: string;
  statut: StatutActe;
  titulaire_nom: string;
  categorie: Categorie;
  motif_renvoi: string | null;
  renvoye_le: string | null;
  renvoye_par: string | null;
  cree_le: string;
  type: TypeResume;
};

function verifier<T>(r: { data: T | null; error: { message: string } | null }, quoi: string): T {
  if (r.error) throw new Error(`Lecture ${quoi} impossible : ${r.error.message}`);
  return r.data as T;
}

/** Tout ce que montre l'accueil de l'officier, pour son entité. */
export async function lireAccueilOfficier(supabase: SupabaseClient, entiteId: string, aujourdhui: string): Promise<AccueilOfficier> {
  const selection =
    "id, identifiant, statut, titulaire_nom, categorie, motif_renvoi, renvoye_le, renvoye_par, cree_le, type:types_actes(code, libelle, famille, couleur)";
  const [duJour, enAttente, renvoyes, nonArchives, agents] = await Promise.all([
    supabase.from("actes").select(selection).eq("entite_id", entiteId).eq("origine", "nouveau").eq("date_acte", aujourdhui)
      .order("cree_le", { ascending: false }).returns<LigneActe[]>(),
    supabase.from("actes").select("id", { count: "exact", head: true }).eq("entite_id", entiteId).eq("statut", "en_attente_paiement"),
    supabase.from("actes").select(selection).eq("entite_id", entiteId).eq("statut", "enregistre").not("motif_renvoi", "is", null)
      .order("renvoye_le", { ascending: true }).returns<LigneActe[]>(),
    supabase.from("vue_actes_non_archives").select("acte_id, journee_paiement").eq("entite_id", entiteId)
      .returns<{ acte_id: string; journee_paiement: string | null }[]>(),
    // Noms des agents de l'entité (migration 20) : « renvoyé par Neema Furaha »
    supabase.rpc("agents_de_mon_entite"),
  ]);
  if (agents.error) throw new Error(`Lecture des agents impossible : ${agents.error.message}`);
  const noms = new Map(((agents.data ?? []) as { id: string; nom_complet: string }[]).map((a) => [a.id, a.nom_complet]));
  const jour = verifier(duJour, "des actes du jour") ?? [];
  if (enAttente.error) throw new Error(`Lecture des actes en attente impossible : ${enAttente.error.message}`);
  const aCorriger = verifier(renvoyes, "des actes renvoyés") ?? [];
  const sansScan = verifier(nonArchives, "des actes à scanner") ?? [];

  // Détails des actes à scanner : type, titulaire, heure du paiement
  const idsAScanner = sansScan.map((l) => l.acte_id);
  const idsDuJour = jour.slice(0, NOMBRE_DERNIERS).map((a) => a.id);
  const [actesAScanner, recus, exonerations, scans] = await Promise.all([
    idsAScanner.length
      ? supabase.from("actes").select(selection).in("id", idsAScanner).returns<LigneActe[]>()
      : Promise.resolve({ data: [] as LigneActe[], error: null }),
    idsAScanner.length
      ? supabase.from("recus").select("acte_id, encaisse_le").in("acte_id", idsAScanner).eq("statut", "valide")
          .returns<{ acte_id: string; encaisse_le: string }[]>()
      : Promise.resolve({ data: [] as { acte_id: string; encaisse_le: string }[], error: null }),
    idsAScanner.length
      ? supabase.from("exonerations").select("acte_id, accorde_le").in("acte_id", idsAScanner)
          .returns<{ acte_id: string; accorde_le: string }[]>()
      : Promise.resolve({ data: [] as { acte_id: string; accorde_le: string }[], error: null }),
    idsDuJour.length
      ? supabase.from("documents_scannes").select("acte_id").in("acte_id", idsDuJour).returns<{ acte_id: string }[]>()
      : Promise.resolve({ data: [] as { acte_id: string }[], error: null }),
  ]);
  const details = new Map((verifier(actesAScanner, "des actes à scanner") ?? []).map((a) => [a.id, a]));
  const payes = new Map((verifier(recus, "des reçus") ?? []).map((r) => [r.acte_id, r.encaisse_le]));
  for (const x of verifier(exonerations, "des exonérations") ?? []) if (!payes.has(x.acte_id)) payes.set(x.acte_id, x.accorde_le);
  const scannes = new Set((verifier(scans, "des scans") ?? []).map((d) => d.acte_id));

  const aScanner: ActeAScanner[] = sansScan
    .flatMap((l) => {
      const a = details.get(l.acte_id);
      if (!a) return [];
      return [{
        id: a.id, identifiant: a.identifiant, type: a.type, titulaire: a.titulaire_nom, categorie: a.categorie,
        payeLe: payes.get(a.id) ?? null, journee: l.journee_paiement, enRetard: l.journee_paiement != null && l.journee_paiement < aujourdhui,
      }];
    })
    // Les oublis des jours précédents d'abord, puis dans l'ordre des paiements
    .sort((a, b) => Number(b.enRetard) - Number(a.enRetard) || (a.payeLe ?? "").localeCompare(b.payeLe ?? ""));

  return {
    compteurs: { enregistres: jour.length, enAttente: enAttente.count ?? 0, renvoyes: aCorriger.length, aScanner: aScanner.length },
    aScanner,
    renvoyes: aCorriger.map((a) => ({
      id: a.id, identifiant: a.identifiant, titulaire: a.titulaire_nom, renvoyeLe: a.renvoye_le,
      par: a.renvoye_par ? (noms.get(a.renvoye_par) ?? null) : null, motif: a.motif_renvoi ?? "",
    })),
    derniers: jour.slice(0, NOMBRE_DERNIERS).map((a) => ({ id: a.id, identifiant: a.identifiant, statut: a.statut, scanne: scannes.has(a.id) })),
  };
}
