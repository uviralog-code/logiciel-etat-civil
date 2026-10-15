/**
 * ENCAISSEMENT (fichier 38) — maquette « Caissier — Encaissement »
 *
 * Décisions validées :
 * - le montant à percevoir est calculé par le logiciel (mêmes règles que la
 *   base, migration 24) et ne se modifie pas ;
 * - un acte au tarif en dollars se paie en $ ou en FC ; un acte au tarif en
 *   francs se paie en FC ;
 * - les francs issus d'une conversion sont arrondis à la centaine la plus proche ;
 * - une fenêtre de confirmation précède l'émission du reçu ;
 * - aide facultative au rendu de monnaie (rien n'est enregistré) ;
 * - exonération : motif courant + précision obligatoire.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { nettoyerNom } from "./actes";
import type { Devise } from "./charte";
import { convertirEnCdf, formaterMontant } from "./tarifs";

// ---------------------------------------------------------------------
// Montant à percevoir
// ---------------------------------------------------------------------

export type APercevoir =
  | { ok: true; montant: number; devise: Devise; /** « 30 $ × 2 850 FC = 85 500 FC » */ calcul: string }
  | { ok: false; message: string };

const MESSAGES_MONTANT = {
  sansTaux: "Aucun taux de change n'est saisi : enregistrez le taux du jour avant d'encaisser un acte en dollars.",
  francsSeulement: "Cet acte est au tarif en francs : il se paie en francs congolais.",
} as const;

const SANS_CONVERSION = "Payé dans la monnaie de l'acte, aucune conversion.";

/** Ce que l'usager doit payer, dans la monnaie choisie, avec l'explication du calcul. */
export function montantAPercevoir(du: { montant: number; devise: Devise }, payeEn: Devise, taux: number | null): APercevoir {
  if (du.devise === "CDF") {
    if (payeEn !== "CDF") return { ok: false, message: MESSAGES_MONTANT.francsSeulement };
    return { ok: true, montant: du.montant, devise: "CDF", calcul: SANS_CONVERSION };
  }
  if (taux == null) return { ok: false, message: MESSAGES_MONTANT.sansTaux };
  const tauxLisible = `${formaterMontant(taux, "CDF")}`;
  if (payeEn === "USD") {
    return { ok: true, montant: du.montant, devise: "USD", calcul: SANS_CONVERSION };
  }
  const exact = Math.round(du.montant * taux * 100) / 100;
  const arrondi = convertirEnCdf(du.montant, "USD", taux)!;
  const base = `${formaterMontant(du.montant, "USD")} × ${tauxLisible} = ${formaterMontant(exact, "CDF")}`;
  return { ok: true, montant: arrondi, devise: "CDF", calcul: exact === arrondi ? base : `${base}, arrondi à ${formaterMontant(arrondi, "CDF")}` };
}

// ---------------------------------------------------------------------
// Rendu de monnaie (aide facultative, rien n'est enregistré)
// ---------------------------------------------------------------------

export type Monnaie =
  | { etat: "vide" }
  | { etat: "invalide"; texte: string }
  | { etat: "manque"; texte: string }
  | { etat: "juste"; texte: string }
  | { etat: "rendre"; texte: string; montant: number };

/** « 100 000 », « 100000 », « 50,5 » → nombre ; null si ce n'est pas un montant. */
export function lireMontant(texte: string): number | null {
  const t = (texte ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

export function monnaieARendre(remis: string, aPercevoir: number, devise: Devise): Monnaie {
  if (!(remis ?? "").trim()) return { etat: "vide" };
  const m = lireMontant(remis);
  if (m == null) return { etat: "invalide", texte: "Tapez le montant remis en chiffres, par exemple 100 000." };
  // En centimes, pour éviter les erreurs de virgule
  const ecart = Math.round(m * 100) - Math.round(aPercevoir * 100);
  if (ecart < 0) return { etat: "manque", texte: `Il manque ${formaterMontant(-ecart / 100, devise)}.` };
  if (ecart === 0) return { etat: "juste", texte: "Compte juste : aucune monnaie à rendre." };
  return { etat: "rendre", montant: ecart / 100, texte: `Monnaie à rendre : ${formaterMontant(ecart / 100, devise)}` };
}

// ---------------------------------------------------------------------
// Exonération : motif courant + précision obligatoire
// ---------------------------------------------------------------------

export const MOTIFS_EXONERATION = [
  "Indigent (attestation d'indigence)",
  "Décision de l'autorité locale",
  "Demande d'un service de l'État",
  "Réparation d'une erreur de l'administration",
  "Autre motif",
] as const;
export const PRECISION_EXONERATION_MAX = 240;

/** Ce qu'on attend dans la précision, selon le motif. */
export function aidePrecision(motif: string): string {
  switch (motif) {
    case MOTIFS_EXONERATION[0]:
      return "Ex. : attestation n° 045/2026 du chef de quartier Kalundu";
    case MOTIFS_EXONERATION[1]:
      return "Ex. : décision du Bourgmestre, lettre n° 12/2026";
    case MOTIFS_EXONERATION[2]:
      return "Ex. : réquisition du Parquet, n° 210/2026";
    case MOTIFS_EXONERATION[3]:
      return "Ex. : erreur de nom sur l'acte MUL-EXNAIS-2026-000101";
    default:
      return "Écrivez le motif de l'exonération";
  }
}

export const MESSAGES_ENCAISSEMENT = {
  motif: "Choisissez le motif de l'exonération.",
  precision: "Précisez l'exonération (3 caractères au moins) : n° de l'attestation, autorité, référence…",
  precisionLongue: `La précision ne doit pas dépasser ${PRECISION_EXONERATION_MAX} caractères.`,
  devise: "Choisissez la monnaie dans laquelle le demandeur paie.",
  introuvable: "Acte introuvable.",
  refus: "Action réservée au caissier de l'entité.",
} as const;

export type Refus = { ok: false; message: string; champ?: "motif" | "precision" | "devise" };

export function composerMotifExoneration(motif: string, precision: string): { ok: true; motif: string } | Refus {
  if (!(MOTIFS_EXONERATION as readonly string[]).includes(motif)) return { ok: false, message: MESSAGES_ENCAISSEMENT.motif, champ: "motif" };
  const p = nettoyerNom(precision);
  if (p.length < 3) return { ok: false, message: MESSAGES_ENCAISSEMENT.precision, champ: "precision" };
  if (p.length > PRECISION_EXONERATION_MAX) return { ok: false, message: MESSAGES_ENCAISSEMENT.precisionLongue, champ: "precision" };
  return { ok: true, motif: motif === "Autre motif" ? p : `${motif} — ${p}` };
}

// ---------------------------------------------------------------------
// Appels à la base
// ---------------------------------------------------------------------

const idValable = (id: string) => /^[0-9a-f-]{36}$/i.test(id ?? "");

function messageDeLaBase(e: { code?: string; message: string }): Refus {
  if (e.code === "42501" || /row-level security/.test(e.message)) return { ok: false, message: MESSAGES_ENCAISSEMENT.refus };
  if (e.code === "P0001") return { ok: false, message: e.message };
  return { ok: false, message: `La base de données a refusé l'opération : ${e.message}` };
}

export type ResultatEncaissement = { ok: true; recu: { id: string; numero: string } } | Refus;

/**
 * Émet le reçu, seulement au montant annoncé à l'usager (encaisser_verifie,
 * migration 24) : si le taux a changé, rien n'est enregistré.
 */
export async function encaisserActe(supabase: SupabaseClient, acteId: string, devise: string, montantAnnonce: number): Promise<ResultatEncaissement> {
  if (!idValable(acteId)) return { ok: false, message: MESSAGES_ENCAISSEMENT.introuvable };
  if (devise !== "USD" && devise !== "CDF") return { ok: false, message: MESSAGES_ENCAISSEMENT.devise, champ: "devise" };
  if (!Number.isFinite(montantAnnonce) || montantAnnonce <= 0) return { ok: false, message: "Montant à percevoir invalide : rechargez la page." };
  const { data, error } = await supabase
    .rpc("encaisser_verifie", { p_acte: acteId, p_devise_recue: devise, p_montant_annonce: montantAnnonce })
    .single<{ id: string; numero_recu: string }>();
  if (error) return messageDeLaBase(error);
  return { ok: true, recu: { id: data.id, numero: data.numero_recu } };
}

export type ResultatExoneration = { ok: true } | Refus;

export async function exonererActe(supabase: SupabaseClient, acteId: string, motif: string, precision: string): Promise<ResultatExoneration> {
  if (!idValable(acteId)) return { ok: false, message: MESSAGES_ENCAISSEMENT.introuvable };
  const m = composerMotifExoneration(motif, precision);
  if (!m.ok) return m;
  const { error } = await supabase.rpc("exonerer", { p_acte: acteId, p_motif: m.motif });
  if (error) return messageDeLaBase(error);
  return { ok: true };
}

/** Le taux que la base appliquera maintenant (sa propre règle, taux_applicable : le dernier saisi). */
export async function lireTauxApplicable(supabase: SupabaseClient, entiteId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("taux_applicable", { p_entite: entiteId });
  if (error) throw new Error(`Lecture du taux impossible : ${error.message}`);
  return data == null ? null : Number(data);
}

/** Heure de la clôture de la journée, si elle est déjà clôturée. */
export async function lireCloture(supabase: SupabaseClient, entiteId: string, journee: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("clotures_caisse")
    .select("cloture_le")
    .eq("entite_id", entiteId)
    .eq("journee", journee)
    .maybeSingle<{ cloture_le: string }>();
  if (error) throw new Error(`Lecture de la clôture impossible : ${error.message}`);
  return data?.cloture_le ?? null;
}
