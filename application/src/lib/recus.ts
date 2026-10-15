/**
 * REÇUS (fichiers 38 et 39) — maquette « Caissier — Reçu »
 *
 * - lecture d'un reçu avec son acte (la base ne montre au caissier que les
 *   reçus de son entité) ;
 * - le contenu du reçu A5, commun à la page imprimée et au PDF ;
 * - impressions comptées : 1re = original, ensuite « DUPLICATA n° N »
 *   (migration 25) ;
 * - QR code : page publique de vérification, sans nom de personne.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise } from "./charte";
import { montantEnLettres } from "./montant-en-lettres";
import { heureUvira } from "./taux";
import { formaterDate, formaterMontant, formaterTaux } from "./tarifs";

export interface RecuDetaille {
  id: string;
  numero: string;
  statut: "valide" | "annule";
  motifAnnulation: string | null;
  encaisseLe: string;
  journee: string;
  montantDu: number;
  deviseDu: Devise;
  montantRecu: number;
  deviseRecue: Devise;
  tauxApplique: number | null;
  equivalentCdf: number;
  caissier: string | null;
  /** Secret du QR code de vérification. */
  jeton: string;
  entite: { nom: string; type: "commune" | "chefferie"; ville: string; province: string };
  /** Nombre d'impressions déjà faites (0 : la prochaine sera l'original). */
  impressions: number;
  acte: { id: string; identifiant: string; titulaire: string; demandeur: string | null; categorie: "national" | "etranger"; typeLibelle: string };
}

type Ligne = {
  id: string;
  numero_recu: string;
  statut: "valide" | "annule";
  motif_annulation: string | null;
  encaisse_le: string;
  journee: string;
  montant_du: number | string;
  devise_du: Devise;
  montant_recu: number | string;
  devise_recue: Devise;
  taux_applique: number | string | null;
  montant_equivalent_cdf: number | string;
  encaisse_par: string | null;
  jeton_verification: string;
  entite: { nom: string; type: "commune" | "chefferie"; ville: string; province: string };
  acte: {
    id: string;
    identifiant: string;
    titulaire_nom: string;
    titulaire_2_nom: string | null;
    demandeur_nom: string | null;
    categorie: "national" | "etranger";
    type: { libelle: string };
  };
};

export async function lireRecu(supabase: SupabaseClient, id: string): Promise<RecuDetaille | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return null;
  const [recu, agents, impressions] = await Promise.all([
    supabase
      .from("recus")
      .select(
        "id, numero_recu, statut, motif_annulation, encaisse_le, journee, montant_du, devise_du, montant_recu, devise_recue, taux_applique, montant_equivalent_cdf, encaisse_par, jeton_verification, entite:entites(nom, type, ville, province), acte:actes(id, identifiant, titulaire_nom, titulaire_2_nom, demandeur_nom, categorie, type:types_actes(libelle))",
      )
      .eq("id", id)
      .maybeSingle<Ligne>(),
    supabase.rpc("agents_de_mon_entite"),
    supabase.from("impressions_recus").select("id", { count: "exact", head: true }).eq("recu_id", id),
  ]);
  if (recu.error) throw new Error(`Lecture du reçu impossible : ${recu.error.message}`);
  if (!recu.data) return null;
  const r = recu.data;
  const noms = new Map(((agents.data ?? []) as { id: string; nom_complet: string }[]).map((a) => [a.id, a.nom_complet]));
  return {
    id: r.id,
    numero: r.numero_recu,
    statut: r.statut,
    motifAnnulation: r.motif_annulation,
    encaisseLe: r.encaisse_le,
    journee: r.journee,
    montantDu: Number(r.montant_du),
    deviseDu: r.devise_du,
    montantRecu: Number(r.montant_recu),
    deviseRecue: r.devise_recue,
    tauxApplique: r.taux_applique == null ? null : Number(r.taux_applique),
    equivalentCdf: Number(r.montant_equivalent_cdf),
    caissier: r.encaisse_par ? (noms.get(r.encaisse_par) ?? null) : null,
    jeton: r.jeton_verification,
    entite: r.entite,
    impressions: impressions.count ?? 0,
    acte: {
      id: r.acte.id,
      identifiant: r.acte.identifiant,
      titulaire: r.acte.titulaire_2_nom ? `${r.acte.titulaire_nom} et ${r.acte.titulaire_2_nom}` : r.acte.titulaire_nom,
      demandeur: r.acte.demandeur_nom,
      categorie: r.acte.categorie,
      typeLibelle: r.acte.type.libelle,
    },
  };
}

// ---------------------------------------------------------------------
// Contenu du reçu A5 (page imprimée et PDF)
// ---------------------------------------------------------------------

/** En-tête officiel : « Province du Sud-Kivu · Ville d'Uvira » (commune) ou « Territoire d'Uvira » (chefferie). */
export function enTeteRecu(entite: RecuDetaille["entite"]): string[] {
  const lieu = entite.type === "chefferie" ? `Territoire d'${entite.ville}` : `Ville d'${entite.ville}`;
  return ["République Démocratique du Congo", `Province du ${entite.province} · ${lieu}`, entite.nom, "Bureau de l'État-Civil"];
}

/** « 13/10/2026 à 08 h 29 » */
export const dateRecu = (r: Pick<RecuDetaille, "journee" | "encaisseLe">) => `${formaterDate(r.journee)} à ${heureUvira(r.encaisseLe)}`;

/** Les lignes du reçu, dans l'ordre de la maquette. */
export function lignesRecu(r: RecuDetaille): [string, string][] {
  const lignes: [string, string][] = [
    ["Acte", r.acte.typeLibelle],
    ["ID de l'acte", r.acte.identifiant],
    ["Titulaire", r.acte.titulaire],
  ];
  if (r.acte.demandeur) lignes.push(["Demandeur", r.acte.demandeur]);
  lignes.push(
    ["Catégorie", r.acte.categorie === "etranger" ? "Étranger" : "National"],
    [`Montant dû (grille ${r.journee.slice(0, 4)})`, formaterMontant(r.montantDu, r.deviseDu)],
  );
  if (r.tauxApplique != null) lignes.push(["Taux appliqué", formaterTaux(r.tauxApplique)]);
  lignes.push(["Mode de paiement", "Espèces"]);
  return lignes;
}

export const montantPayeRecu = (r: RecuDetaille) => formaterMontant(r.montantRecu, r.deviseRecue);
export const montantPayeEnLettres = (r: RecuDetaille) => montantEnLettres(r.montantRecu, r.deviseRecue);

export const MENTION_RECU =
  "Ce reçu est la preuve du paiement : conservez-le. Un reçu portant la mention « ANNULÉ » n'a aucune valeur. Scannez le code pour vérifier son authenticité, ou présentez-le au Bureau de l'État-Civil.";

/** « DUPLICATA n° 2 » à partir de la 2e impression ; rien pour l'original. */
export function mentionImpression(numero: number | null): string | null {
  return numero != null && numero > 1 ? `DUPLICATA n° ${numero}` : null;
}

/** « Imprimé 2 fois · la prochaine impression portera « DUPLICATA n° 3 » » */
export function etatImpressions(impressions: number): string {
  if (impressions === 0) return "Pas encore imprimé : la prochaine impression sera l'original.";
  return `Imprimé ${impressions} fois : la prochaine impression portera « DUPLICATA n° ${impressions + 1} ».`;
}

// ---------------------------------------------------------------------
// Impressions et vérification
// ---------------------------------------------------------------------

export type ResultatImpression = { ok: true; numero: number } | { ok: false; message: string };

/** Compte une impression (ou un PDF) et renvoie son numéro : 1 = original (migration 25). */
export async function enregistrerImpression(supabase: SupabaseClient, recuId: string, forme: "impression" | "pdf"): Promise<ResultatImpression> {
  if (!/^[0-9a-f-]{36}$/i.test(recuId ?? "")) return { ok: false, message: "Reçu introuvable." };
  const { data, error } = await supabase.rpc("enregistrer_impression", { p_recu: recuId, p_forme: forme });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : `Impression impossible : ${error.message}` };
  return { ok: true, numero: Number(data) };
}

/** Adresse imprimée dans le QR code. */
export const adresseVerification = (origine: string, jeton: string) => `${origine.replace(/\/+$/, "")}/verifier/${jeton}`;

export interface RecuVerifie {
  numero: string;
  entite: string;
  typeActe: string;
  encaisseLe: string;
  journee: string;
  montant: number;
  devise: Devise;
  statut: "valide" | "annule";
  annuleLe: string | null;
}

/** Page publique du QR code : sans connexion, sans nom de personne. */
export async function verifierRecu(supabase: SupabaseClient, jeton: string): Promise<RecuVerifie | null> {
  if (!/^[0-9a-f]{32}$/.test(jeton ?? "")) return null;
  const { data, error } = await supabase.rpc("verifier_recu", { p_jeton: jeton });
  if (error) throw new Error(`Vérification impossible : ${error.message}`);
  const l = (data as {
    numero_recu: string; entite: string; type_acte: string; encaisse_le: string; journee: string;
    montant_recu: number | string; devise_recue: Devise; statut: "valide" | "annule"; annule_le: string | null;
  }[] | null)?.[0];
  if (!l) return null;
  return {
    numero: l.numero_recu, entite: l.entite, typeActe: l.type_acte, encaisseLe: l.encaisse_le, journee: l.journee,
    montant: Number(l.montant_recu), devise: l.devise_recue, statut: l.statut, annuleLe: l.annule_le,
  };
}
