/**
 * TAUX DU JOUR (fichier 26) — écran du caissier et rappel sur son accueil
 *
 * Règles (décisions de l'étape 5) :
 * - le taux s'applique dès sa saisie (ni antidaté, ni programmé : migration 17) ;
 * - garde-fou de la base : entre 500 et 20 000 FC pour 1 $ (fichier 03) ;
 * - un écart de plus de 10 % avec le taux précédent demande une confirmation
 *   (faute de frappe probable) ;
 * - sans taux saisi aujourd'hui, le dernier taux reste utilisable : l'accueil
 *   du caissier affiche seulement un rappel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { aujourdhuiUvira, convertirEnCdf, FUSEAU_UVIRA, formaterDate, formaterMontant } from "./tarifs";

export const TAUX_MINIMUM = 500;
export const TAUX_MAXIMUM = 20_000;
/** Au-delà de cet écart avec le taux précédent, on demande confirmation. */
export const SEUIL_CONFIRMATION = 0.1;

export interface LigneTaux {
  id: string;
  taux: number;
  en_vigueur_depuis: string; // horodatage
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

/** « 07 h 58 » à l'heure d'Uvira. */
export function heureUvira(horodatage: string | Date): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU_UVIRA })
    .format(new Date(horodatage))
    .replace(":", " h ");
}

/** « 2 850 » */
export function formaterNombreTaux(taux: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(taux));
}

/** « +19 % », « −3,5 % » */
export function formaterEcart(ecart: number): string {
  const pourcent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(ecart) * 100);
  return `${ecart >= 0 ? "+" : "−"}${pourcent} %`;
}

/** Exemple de conversion affiché sous le champ : « 10 $ = 28 500 FC ». */
export function exempleConversion(taux: number, dollars = 10): string {
  return `${formaterMontant(dollars, "USD")} = ${formaterMontant(convertirEnCdf(dollars, "USD", taux)!, "CDF")}`;
}

// ---------------------------------------------------------------------
// État du taux pour aujourd'hui
// ---------------------------------------------------------------------

export type EtatTaux =
  | { type: "du-jour"; taux: number; heure: string }
  | { type: "ancien"; taux: number; date: string } // dernier taux, saisi un autre jour
  | { type: "aucun" };

export function etatTauxDuJour(dernier: Pick<LigneTaux, "taux" | "en_vigueur_depuis"> | null, maintenant = new Date()): EtatTaux {
  if (!dernier) return { type: "aucun" };
  const jour = aujourdhuiUvira(new Date(dernier.en_vigueur_depuis));
  if (jour === aujourdhuiUvira(maintenant)) {
    return { type: "du-jour", taux: Number(dernier.taux), heure: heureUvira(dernier.en_vigueur_depuis) };
  }
  return { type: "ancien", taux: Number(dernier.taux), date: formaterDate(jour) };
}

// ---------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------

export const MESSAGES_TAUX = {
  vide: "Tapez le taux en chiffres : le nombre de francs congolais pour 1 dollar, par exemple 2 850.",
  decimales: "Deux chiffres au plus après la virgule.",
  refus: "Action réservée au caissier de l'entité.",
} as const;

export function messageHorsLimites(taux: number): string {
  return `Taux invraisemblable : ${formaterNombreTaux(taux)} FC pour 1 $. Il doit être compris entre ${formaterNombreTaux(TAUX_MINIMUM)} et ${formaterNombreTaux(TAUX_MAXIMUM)} FC. Vérifiez qu'il ne manque pas un chiffre, ou qu'il n'y en a pas un de trop.`;
}

/** « 2 850 » → 2850. Renvoie un message si le taux n'est pas valable. */
export function lireTaux(texte: string): number | string {
  const nettoye = (texte ?? "").replace(/[\s  ]/g, "").replace(/(FC|fc)$/, "");
  if (!/^\d+([.,]\d+)?$/.test(nettoye)) return MESSAGES_TAUX.vide;
  const [, decimales = ""] = nettoye.split(/[.,]/);
  if (decimales.replace(/0+$/, "").length > 2) return MESSAGES_TAUX.decimales;
  const taux = Number(nettoye.replace(",", "."));
  if (taux < TAUX_MINIMUM || taux > TAUX_MAXIMUM) return messageHorsLimites(taux);
  return taux;
}

/** Écart relatif avec le taux précédent (0,19 = +19 %), vide s'il n'y a pas de taux précédent. */
export function ecartAvec(taux: number, precedent: number | null): number | null {
  if (precedent == null || precedent <= 0) return null;
  return taux / precedent - 1;
}

export function demandeConfirmation(taux: number, precedent: number | null): boolean {
  const ecart = ecartAvec(taux, precedent);
  return ecart != null && Math.abs(ecart) > SEUIL_CONFIRMATION + 1e-9;
}

// ---------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------

/** Les derniers taux de l'entité, du plus récent au plus ancien. */
export async function lireHistoriqueTaux(supabase: SupabaseClient, entiteId: string, limite = 30): Promise<LigneTaux[]> {
  const { data, error } = await supabase
    .from("taux_change")
    .select("id, taux, en_vigueur_depuis")
    .eq("entite_id", entiteId)
    .order("en_vigueur_depuis", { ascending: false })
    .limit(limite)
    .returns<LigneTaux[]>();
  if (error) throw new Error(`Lecture des taux impossible : ${error.message}`);
  return (data ?? []).map((l) => ({ ...l, taux: Number(l.taux) }));
}

export type ResultatTaux = { ok: true; taux: number; heure: string } | { ok: false; message: string };

/** Enregistre le taux du jour : il s'applique à l'instant (heure fixée par la base). */
export async function enregistrerTaux(supabase: SupabaseClient, entiteId: string, texte: string): Promise<ResultatTaux> {
  const taux = lireTaux(String(texte ?? ""));
  if (typeof taux === "string") return { ok: false, message: taux };

  const { data, error } = await supabase
    .from("taux_change")
    .insert({ entite_id: entiteId, taux })
    .select("taux, en_vigueur_depuis")
    .returns<{ taux: number; en_vigueur_depuis: string }[]>();
  if (error) {
    if (error.code === "23514") return { ok: false, message: messageHorsLimites(taux) };
    if (error.code === "42501") return { ok: false, message: MESSAGES_TAUX.refus };
    if (error.code === "23505") return { ok: false, message: "Un taux vient d'être enregistré à la même seconde. Réessayez." };
    if (error.code === "P0001") return { ok: false, message: error.message };
    return { ok: false, message: `La base de données a refusé l'enregistrement : ${error.message}` };
  }
  const ligne = data?.[0];
  if (!ligne) return { ok: false, message: MESSAGES_TAUX.refus };
  return { ok: true, taux: Number(ligne.taux), heure: heureUvira(ligne.en_vigueur_depuis) };
}
