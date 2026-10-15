/**
 * CLÔTURE DE CAISSE (fichier 41) — maquette « Caissier — Clôture de caisse »
 *
 * - aide au comptage : le nombre de billets de chaque valeur donne le total
 *   compté, en francs et en dollars ;
 * - attendu (calculé par la base à partir des reçus valides), compté, écart ;
 * - un écart doit être expliqué (règle de la base, fichier 05) : l'écart et
 *   son explication sont transmis à l'administrateur (rapports) ;
 * - les actes payés aujourd'hui sans scan sont signalés, sans bloquer ;
 * - une fois clôturée, la journée est verrouillée : plus d'encaissement,
 *   d'exonération ni d'annulation de reçu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise } from "./charte";
import { nettoyerNom } from "./actes";
import { lireMontant } from "./encaissement";
import { formaterMontant } from "./tarifs";

/** Billets en circulation, du plus grand au plus petit. */
export const BILLETS: Record<Devise, number[]> = {
  CDF: [20000, 10000, 5000, 1000, 500, 200, 100, 50],
  USD: [100, 50, 20, 10, 5, 2, 1],
};

/** Total de l'aide au comptage ; null si un nombre de billets n'est pas un entier positif. */
export function totalBillets(nombres: Record<number, string>, devise: Devise): number | null {
  let total = 0;
  for (const valeur of BILLETS[devise]) {
    const t = (nombres[valeur] ?? "").trim();
    if (!t) continue;
    if (!/^\d{1,5}$/.test(t)) return null;
    total += valeur * Number(t);
  }
  return total;
}

/** « 218 500 » ou « 218500 » → nombre ; null si ce n'est pas un montant (FC : entier ; $ : 2 décimales). */
export function lireCompte(texte: string, devise: Devise): number | null {
  const m = lireMontant(texte);
  if (m == null) return null;
  return devise === "CDF" && !Number.isInteger(m) ? null : m;
}

export interface Ecart {
  montant: number;
  /** « − 5 000 FC · manque », « 0 FC · juste », « + 2 000 FC · excédent » */
  texte: string;
  etat: "juste" | "manque" | "excedent";
}

export function ecart(compte: number, attendu: number, devise: Devise): Ecart {
  const e = Math.round((compte - attendu) * 100) / 100;
  if (e === 0) return { montant: 0, etat: "juste", texte: `${formaterMontant(0, devise)} · juste` };
  return e < 0
    ? { montant: e, etat: "manque", texte: `− ${formaterMontant(-e, devise)} · manque` }
    : { montant: e, etat: "excedent", texte: `+ ${formaterMontant(e, devise)} · excédent` };
}

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

export interface ClotureFaite {
  clotureLe: string;
  par: string | null;
  attenduUsd: number;
  attenduCdf: number;
  compteUsd: number;
  compteCdf: number;
  ecartUsd: number;
  ecartCdf: number;
  explication: string | null;
  nbRecus: number;
  nbAnnules: number;
  nbExonerations: number;
  totalEquivalentCdf: number;
}

export interface ActeSansScan {
  id: string;
  identifiant: string;
  titulaire: string;
}

/** Les actes payés (ou exonérés) ce jour-là et toujours sans scan : signalés à l'administrateur. */
export async function lireActesSansScan(supabase: SupabaseClient, entiteId: string, journee: string): Promise<ActeSansScan[]> {
  const { data, error } = await supabase
    .from("vue_actes_non_archives")
    .select("acte_id, identifiant, titulaire_nom")
    .eq("entite_id", entiteId)
    .eq("journee_paiement", journee)
    .order("identifiant");
  if (error) throw new Error(`Lecture des actes sans scan impossible : ${error.message}`);
  return ((data ?? []) as { acte_id: string; identifiant: string; titulaire_nom: string }[]).map((a) => ({
    id: a.acte_id, identifiant: a.identifiant, titulaire: a.titulaire_nom,
  }));
}

export async function lireClotureFaite(supabase: SupabaseClient, entiteId: string, journee: string): Promise<ClotureFaite | null> {
  const [cloture, agents] = await Promise.all([
    supabase
      .from("clotures_caisse")
      .select("cloture_le, cloture_par, attendu_usd, attendu_cdf, compte_usd, compte_cdf, ecart_usd, ecart_cdf, explication_ecart, nb_recus, nb_recus_annules, nb_exonerations, total_equivalent_cdf")
      .eq("entite_id", entiteId)
      .eq("journee", journee)
      .maybeSingle<Record<string, string | number | null>>(),
    supabase.rpc("agents_de_mon_entite"),
  ]);
  if (cloture.error) throw new Error(`Lecture de la clôture impossible : ${cloture.error.message}`);
  const c = cloture.data;
  if (!c) return null;
  const noms = new Map(((agents.data ?? []) as { id: string; nom_complet: string }[]).map((a) => [a.id, a.nom_complet]));
  const n = (cle: string) => Number(c[cle] ?? 0);
  return {
    clotureLe: String(c.cloture_le), par: c.cloture_par ? (noms.get(String(c.cloture_par)) ?? null) : null,
    attenduUsd: n("attendu_usd"), attenduCdf: n("attendu_cdf"), compteUsd: n("compte_usd"), compteCdf: n("compte_cdf"),
    ecartUsd: n("ecart_usd"), ecartCdf: n("ecart_cdf"), explication: (c.explication_ecart as string | null) ?? null,
    nbRecus: n("nb_recus"), nbAnnules: n("nb_recus_annules"), nbExonerations: n("nb_exonerations"), totalEquivalentCdf: n("total_equivalent_cdf"),
  };
}

// ---------------------------------------------------------------------
// Clôturer
// ---------------------------------------------------------------------

export const MESSAGES_CLOTURE = {
  usd: "Indiquez les dollars comptés en caisse (0 s'il n'y en a pas).",
  cdf: "Indiquez les francs comptés en caisse, sans centimes (0 s'il n'y en a pas).",
  explication: "Il y a un écart : expliquez-le (5 caractères au moins). L'explication est transmise à l'administrateur.",
  explicationLongue: "L'explication ne doit pas dépasser 500 caractères.",
  attenduChange:
    "Un reçu a été émis ou annulé pendant le comptage : les montants attendus ont changé. Vérifiez les nouveaux montants (écran mis à jour), puis clôturez de nouveau.",
  dejaCloturee: "Cette journée est déjà clôturée.",
  refus: "Action réservée au caissier de l'entité.",
} as const;

export type ResultatCloture = { ok: true } | { ok: false; message: string; champ?: "usd" | "cdf" | "explication" };

export interface SaisieCloture {
  compteUsd: string;
  compteCdf: string;
  explication: string;
  /** Montants attendus affichés au Caissier : si la base calcule autre chose, rien n'est clôturé. */
  attenduUsd: number;
  attenduCdf: number;
}

export function validerCloture(s: SaisieCloture): { ok: true; usd: number; cdf: number; explication: string | null } | Extract<ResultatCloture, { ok: false }> {
  const usd = lireCompte(s.compteUsd, "USD");
  if (usd == null) return { ok: false, message: MESSAGES_CLOTURE.usd, champ: "usd" };
  const cdf = lireCompte(s.compteCdf, "CDF");
  if (cdf == null) return { ok: false, message: MESSAGES_CLOTURE.cdf, champ: "cdf" };
  const explication = nettoyerNom(s.explication);
  const avecEcart = ecart(usd, s.attenduUsd, "USD").montant !== 0 || ecart(cdf, s.attenduCdf, "CDF").montant !== 0;
  if (avecEcart && explication.length < 5) return { ok: false, message: MESSAGES_CLOTURE.explication, champ: "explication" };
  if (explication.length > 500) return { ok: false, message: MESSAGES_CLOTURE.explicationLongue, champ: "explication" };
  return { ok: true, usd, cdf, explication: explication || null };
}

export async function cloturerJournee(supabase: SupabaseClient, entiteId: string, journee: string, s: SaisieCloture): Promise<ResultatCloture> {
  const v = validerCloture(s);
  if (!v.ok) return v;
  // Les attendus ont-ils changé depuis l'affichage ? (reçu émis ou annulé entre-temps)
  const { data: synthese, error: e1 } = await supabase.rpc("rapport_synthese", { p_periodicite: "jour", p_date: journee, p_entite: entiteId });
  if (e1) return { ok: false, message: `Lecture des montants attendus impossible : ${e1.message}` };
  const t = ((synthese ?? []) as Record<string, number | string>[])[0] ?? {};
  if (Number(t.recettes_usd ?? 0) !== s.attenduUsd || Number(t.recettes_cdf ?? 0) !== s.attenduCdf) {
    return { ok: false, message: MESSAGES_CLOTURE.attenduChange };
  }
  const { error } = await supabase.rpc("cloturer_journee", {
    p_entite: entiteId, p_compte_usd: v.usd, p_compte_cdf: v.cdf, p_explication: v.explication, p_journee: journee,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: MESSAGES_CLOTURE.dejaCloturee };
    if (error.code === "42501" || /row-level security/.test(error.message)) return { ok: false, message: MESSAGES_CLOTURE.refus };
    if (/Écart constaté/.test(error.message)) return { ok: false, message: MESSAGES_CLOTURE.attenduChange };
    if (error.code === "P0001") return { ok: false, message: error.message };
    return { ok: false, message: `La base de données a refusé la clôture : ${error.message}` };
  }
  return { ok: true };
}
