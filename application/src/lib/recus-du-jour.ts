/**
 * REÇUS DU JOUR (fichier 40) — menu « Reçus du jour » du Caissier
 *
 * Tout ce qui s'est passé à la caisse aujourd'hui : reçus (valides et
 * annulés) et exonérations, avec les totaux (calculés par la base, comme les
 * rapports) — de quoi préparer la clôture.
 *
 * Annuler un reçu (décisions validées) : le jour même, avant la clôture,
 * motif en texte libre ; le Caissier choisit ce que devient l'acte
 * (migration 26) : remis dans la file (erreur de caisse) ou annulé.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise, StatutActe } from "./charte";
import { nettoyerNom } from "./actes";

export interface RecuDuJour {
  id: string;
  numero: string;
  encaisseLe: string;
  montant: number;
  devise: Devise;
  statut: "valide" | "annule";
  motifAnnulation: string | null;
  suiteAnnulation: "acte_annule" | "acte_remis_en_file" | null;
  acte: { id: string; identifiant: string; titulaire: string; statut: StatutActe; typeLibelle: string };
}

export interface ExonerationDuJour {
  acte: { id: string; identifiant: string; titulaire: string; typeLibelle: string };
  montant: number;
  devise: Devise;
  motif: string;
  accordeLe: string;
}

export interface TotauxDuJour {
  usd: number;
  cdf: number;
  equivalentCdf: number;
  valides: number;
  annules: number;
  exonerations: number;
  exonereUsd: number;
  exonereCdf: number;
}

export interface JourneeCaisse {
  recus: RecuDuJour[];
  exonerations: ExonerationDuJour[];
  totaux: TotauxDuJour;
  clotureLe: string | null;
}

type ActeLu = { id: string; identifiant: string; titulaire_nom: string; titulaire_2_nom: string | null; statut: StatutActe; type: { libelle: string } };
const titulaire = (a: ActeLu) => (a.titulaire_2_nom ? `${a.titulaire_nom} et ${a.titulaire_2_nom}` : a.titulaire_nom);
const ACTE = "acte:actes(id, identifiant, titulaire_nom, titulaire_2_nom, statut, type:types_actes(libelle))";

function verifier<T>(r: { data: T | null; error: { message: string } | null }, quoi: string): T {
  if (r.error) throw new Error(`Lecture ${quoi} impossible : ${r.error.message}`);
  return r.data as T;
}

/** Reçus, exonérations et totaux d'une journée de caisse de l'entité. */
export async function lireJourneeCaisse(supabase: SupabaseClient, entiteId: string, journee: string): Promise<JourneeCaisse> {
  const [recus, exonerations, synthese, cloture] = await Promise.all([
    supabase
      .from("recus")
      .select(`id, numero_recu, encaisse_le, montant_recu, devise_recue, statut, motif_annulation, suite_annulation, ${ACTE}`)
      .eq("entite_id", entiteId)
      .eq("journee", journee)
      .order("encaisse_le", { ascending: false }),
    supabase
      .from("exonerations")
      .select(`montant_du, devise_du, motif, accorde_le, ${ACTE}`)
      .eq("entite_id", entiteId)
      .eq("journee", journee)
      .order("accorde_le", { ascending: false }),
    supabase.rpc("rapport_synthese", { p_periodicite: "jour", p_date: journee, p_entite: entiteId }),
    supabase.from("clotures_caisse").select("cloture_le").eq("entite_id", entiteId).eq("journee", journee).maybeSingle<{ cloture_le: string }>(),
  ]);
  type LigneRecu = {
    id: string; numero_recu: string; encaisse_le: string; montant_recu: number | string; devise_recue: Devise; statut: "valide" | "annule";
    motif_annulation: string | null; suite_annulation: RecuDuJour["suiteAnnulation"]; acte: ActeLu;
  };
  type LigneExo = { montant_du: number | string; devise_du: Devise; motif: string; accorde_le: string; acte: ActeLu };
  const s = ((verifier(synthese, "des totaux") ?? []) as Record<string, number | string>[])[0] ?? {};
  const nb = (cle: string) => Number(s[cle] ?? 0);
  return {
    recus: ((verifier(recus, "des reçus") ?? []) as unknown as LigneRecu[]).map((r) => ({
      id: r.id, numero: r.numero_recu, encaisseLe: r.encaisse_le, montant: Number(r.montant_recu), devise: r.devise_recue, statut: r.statut,
      motifAnnulation: r.motif_annulation, suiteAnnulation: r.suite_annulation,
      acte: { id: r.acte.id, identifiant: r.acte.identifiant, titulaire: titulaire(r.acte), statut: r.acte.statut, typeLibelle: r.acte.type.libelle },
    })),
    exonerations: ((verifier(exonerations, "des exonérations") ?? []) as unknown as LigneExo[]).map((x) => ({
      montant: Number(x.montant_du), devise: x.devise_du, motif: x.motif, accordeLe: x.accorde_le,
      acte: { id: x.acte.id, identifiant: x.acte.identifiant, titulaire: titulaire(x.acte), typeLibelle: x.acte.type.libelle },
    })),
    totaux: {
      usd: nb("recettes_usd"), cdf: nb("recettes_cdf"), equivalentCdf: nb("recettes_equivalent_cdf"),
      valides: nb("recus_valides"), annules: nb("recus_annules"),
      exonerations: nb("exonerations"), exonereUsd: nb("exonere_usd"), exonereCdf: nb("exonere_cdf"),
    },
    clotureLe: verifier(cloture, "de la clôture")?.cloture_le ?? null,
  };
}

// ---------------------------------------------------------------------
// Annulation d'un reçu
// ---------------------------------------------------------------------

export type SuiteAnnulation = "remettre" | "annuler-acte";

export const MESSAGES_ANNULATION = {
  suite: "Choisissez ce que devient l'acte.",
  motif: "Indiquez le motif de l'annulation (3 caractères au moins).",
  motifLong: "Le motif ne doit pas dépasser 300 caractères.",
  introuvable: "Reçu introuvable.",
  refus: "Action réservée au caissier de l'entité.",
} as const;

export type ResultatAnnulation =
  | { ok: true; numero: string; remis: boolean; acte: string }
  | { ok: false; message: string; champ?: "suite" | "motif" };

/** Le reçu peut-il encore être annulé ? Sinon, pourquoi. */
export function obstacleAnnulation(recu: Pick<RecuDuJour, "statut">, clotureLe: string | null): string | null {
  if (recu.statut === "annule") return "Ce reçu est déjà annulé.";
  if (clotureLe) return "La caisse de ce jour est clôturée : ce reçu ne peut plus être annulé.";
  return null;
}

/** Un acte déjà délivré ne revient jamais dans la file (migration 26). */
export const peutRevenirEnFile = (statutActe: StatutActe) => statutActe === "paye";

export async function annulerRecu(supabase: SupabaseClient, recuId: string, motif: string, suite: string): Promise<ResultatAnnulation> {
  if (!/^[0-9a-f-]{36}$/i.test(recuId ?? "")) return { ok: false, message: MESSAGES_ANNULATION.introuvable };
  if (suite !== "remettre" && suite !== "annuler-acte") return { ok: false, message: MESSAGES_ANNULATION.suite, champ: "suite" };
  const m = nettoyerNom(motif);
  if (m.length < 3) return { ok: false, message: MESSAGES_ANNULATION.motif, champ: "motif" };
  if (m.length > 300) return { ok: false, message: MESSAGES_ANNULATION.motifLong, champ: "motif" };
  const { data, error } = await supabase
    .rpc("annuler_recu", { p_recu: recuId, p_motif: m, p_remettre_en_file: suite === "remettre" })
    .select(`numero_recu, ${ACTE}`)
    .single<{ numero_recu: string; acte: ActeLu }>();
  if (error) {
    if (error.code === "42501" || /row-level security/.test(error.message)) return { ok: false, message: MESSAGES_ANNULATION.refus };
    if (error.code === "P0001") return { ok: false, message: error.message };
    return { ok: false, message: `La base de données a refusé l'annulation : ${error.message}` };
  }
  return { ok: true, numero: data.numero_recu, remis: suite === "remettre", acte: data.acte.identifiant };
}

/** Message affiché après l'annulation. */
export function messageAnnulation(r: Extract<ResultatAnnulation, { ok: true }>): string {
  return r.remis
    ? `Reçu ${r.numero} annulé. L'acte ${r.acte} est revenu dans la file « À encaisser ».`
    : `Reçu ${r.numero} annulé, ainsi que l'acte ${r.acte} : l'Officier devra en enregistrer un nouveau.`;
}
