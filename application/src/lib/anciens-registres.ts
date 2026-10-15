/**
 * ANCIENS REGISTRES — IMPORT EN LOT (fichier 36)
 *
 * Un lot = un registre papier (un type d'acte, une année, une entité). Chaque
 * ancien acte y est ajouté avec l'essentiel — nom(s), date, n° dans le
 * registre papier — puis son scan est joint (mode « lot »). L'acte reçoit un
 * ID normal, est classé « délivré », sans montant (migration 23).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FamilleActe } from "./charte";

export interface Lot {
  id: string;
  entite_id: string;
  type_acte_id: string;
  annee_registre: number;
  description: string;
  statut: "ouvert" | "ferme";
  cree_le: string;
  ferme_le: string | null;
  type_code: string;
  type_libelle: string;
  modele_fiche: string;
  type_couleur: string | null;
  type_famille: FamilleActe;
  nb_actes: number;
  nb_scannes: number;
}

export interface ActeDuLot {
  id: string;
  identifiant: string;
  titulaire: string;
  titulaire2: string | null;
  numeroRegistre: string | null;
  dateActe: string;
  numeroOrdre: number;
  scanne: boolean;
}

const message = (e: { code?: string; message: string }, defaut: string) => (e.code === "P0001" ? e.message : `${defaut} : ${e.message}`);

/** Les lots de l'entité : ouverts d'abord, puis les plus récents. */
export async function lireLots(supabase: SupabaseClient): Promise<Lot[]> {
  const { data, error } = await supabase.from("vue_lots").select("*").order("cree_le", { ascending: false }).returns<Lot[]>();
  if (error) throw new Error(`Lecture des lots impossible : ${error.message}`);
  return [...(data ?? [])].sort((a, b) => Number(a.statut === "ferme") - Number(b.statut === "ferme"));
}

/** Un lot et ses actes (les derniers ajoutés d'abord). */
export async function lireLot(supabase: SupabaseClient, id: string): Promise<{ lot: Lot; actes: ActeDuLot[] } | null> {
  const [lot, actes] = await Promise.all([
    supabase.from("vue_lots").select("*").eq("id", id).maybeSingle<Lot>(),
    supabase
      .from("actes")
      .select("id, identifiant, titulaire_nom, titulaire_2_nom, numero_registre, date_acte, numero_ordre, documents_scannes(id)")
      .eq("lot_id", id)
      .order("numero_ordre", { ascending: false })
      .returns<{ id: string; identifiant: string; titulaire_nom: string; titulaire_2_nom: string | null; numero_registre: string | null; date_acte: string; numero_ordre: number; documents_scannes: { id: string }[] }[]>(),
  ]);
  if (lot.error) throw new Error(`Lecture du lot impossible : ${lot.error.message}`);
  if (actes.error) throw new Error(`Lecture des actes du lot impossible : ${actes.error.message}`);
  if (!lot.data) return null;
  return {
    lot: lot.data,
    actes: (actes.data ?? []).map((a) => ({
      id: a.id, identifiant: a.identifiant, titulaire: a.titulaire_nom, titulaire2: a.titulaire_2_nom, numeroRegistre: a.numero_registre,
      dateActe: a.date_acte, numeroOrdre: a.numero_ordre, scanne: a.documents_scannes.length > 0,
    })),
  };
}

// ---------------------------------------------------------------------
// Ouvrir un lot
// ---------------------------------------------------------------------
export interface SaisieLot {
  typeActeId: string;
  annee: string;
  description: string;
}
export type ResultatLot = { ok: true; id: string } | { ok: false; message: string; champ?: keyof SaisieLot };

export function validerLot(s: SaisieLot, anneeEnCours: number): { ok: true; annee: number; description: string } | { ok: false; message: string; champ: keyof SaisieLot } {
  if (!s.typeActeId) return { ok: false, message: "Choisissez le type d'acte du registre.", champ: "typeActeId" };
  const annee = Number(s.annee.trim());
  if (!/^\d{4}$/.test(s.annee.trim()) || annee < 1900 || annee > anneeEnCours) {
    return { ok: false, message: `Année du registre invalide (de 1900 à ${anneeEnCours}).`, champ: "annee" };
  }
  const description = s.description.trim().replace(/\s+/g, " ");
  if (description.length < 3) return { ok: false, message: "Décrivez le registre, par exemple « Registre des naissances 2019, volume 1 ».", champ: "description" };
  if (description.length > 120) return { ok: false, message: "Description trop longue (120 caractères au plus).", champ: "description" };
  return { ok: true, annee, description };
}

export async function creerLot(supabase: SupabaseClient, s: SaisieLot, anneeEnCours: number): Promise<ResultatLot> {
  const v = validerLot(s, anneeEnCours);
  if (!v.ok) return v;
  const { data, error } = await supabase.rpc("creer_lot", { p_type_acte: s.typeActeId, p_annee: v.annee, p_description: v.description }).single<{ id: string }>();
  if (error) return { ok: false, message: message(error, "Le lot n'a pas pu être ouvert") };
  return { ok: true, id: data.id };
}

export async function fermerLot(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase.from("lots_import").update({ statut: "ferme" }).eq("id", id).select("id");
  if (error) return { ok: false, message: message(error, "Le lot n'a pas pu être fermé") };
  if (!data?.length) return { ok: false, message: "Lot introuvable." };
  return { ok: true };
}

// ---------------------------------------------------------------------
// Ajouter un ancien acte
// ---------------------------------------------------------------------
export interface SaisieAncien {
  titulaire: string;
  titulaire2: string;
  date: string;
  numero: string;
}
export type ResultatAncien = { ok: true; acte: { id: string; identifiant: string } } | { ok: false; message: string; champ?: keyof SaisieAncien };

/** Contrôle avant l'envoi (la base vérifie tout à nouveau). */
export function validerAncien(s: SaisieAncien, lot: { annee_registre: number; modele_fiche: string }, aujourdhui: string): { ok: true } | { ok: false; message: string; champ: keyof SaisieAncien } {
  if (!s.titulaire.trim()) return { ok: false, message: lot.modele_fiche === "mariage" ? "Indiquez le nom de l'époux." : "Indiquez le nom du titulaire.", champ: "titulaire" };
  if (lot.modele_fiche === "mariage" && !s.titulaire2.trim()) return { ok: false, message: "Indiquez le nom de l'épouse.", champ: "titulaire2" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return { ok: false, message: "Indiquez la date de l'acte dans le registre.", champ: "date" };
  if (s.date > aujourdhui) return { ok: false, message: "La date de l'acte ne peut pas être dans le futur.", champ: "date" };
  if (Number(s.date.slice(0, 4)) !== lot.annee_registre) return { ok: false, message: `La date doit être en ${lot.annee_registre}, l'année de ce registre.`, champ: "date" };
  if (!s.numero.trim()) return { ok: false, message: "Indiquez le n° de l'acte dans le registre papier.", champ: "numero" };
  return { ok: true };
}

export async function ajouterActeAncien(supabase: SupabaseClient, lotId: string, s: SaisieAncien): Promise<ResultatAncien> {
  const { data, error } = await supabase
    .rpc("ajouter_acte_ancien", { p_lot: lotId, p_titulaire_nom: s.titulaire, p_titulaire_2_nom: s.titulaire2 || null, p_date_acte: s.date, p_numero_registre: s.numero })
    .single<{ id: string; identifiant: string }>();
  if (error) {
    const m = message(error, "L'acte n'a pas pu être enregistré");
    return { ok: false, message: m, champ: /déjà numérisé|n° de l'acte/.test(m) ? "numero" : /date/i.test(m) ? "date" : undefined };
  }
  return { ok: true, acte: { id: data.id, identifiant: data.identifiant } };
}

// ---------------------------------------------------------------------
// Aides à la saisie
// ---------------------------------------------------------------------

/** N° suivant proposé : « 412 » → « 413 », « 412 bis » → « 413 » ; sinon rien. */
export function numeroSuivant(n: string | null | undefined): string {
  const m = (n ?? "").match(/^\D*(\d{1,6})/);
  return m ? String(Number(m[1]) + 1) : "";
}

/** N° lu dans le nom d'un fichier : « 412.pdf », « reg2019_412.jpg », « 412bis.pdf » → « 412 bis ». */
export function numeroDepuisNomFichier(nom: string, annee?: number): string {
  const base = nom.replace(/\.[a-z0-9]{2,4}$/i, "");
  const groupes = [...base.matchAll(/(\d{1,6})\s*(bis|ter)?/gi)].filter((g) => Number(g[1]) !== annee || g[1].length !== 4);
  const dernier = groupes.at(-1);
  if (!dernier) return "";
  return dernier[2] ? `${Number(dernier[1])} ${dernier[2].toLowerCase()}` : String(Number(dernier[1]));
}

/**
 * Pages d'un gros PDF pour UN acte : « 3 », « 3-4 », « 3,5 » (1 = la première).
 * Renvoie les numéros (à partir de 0) ou un message.
 */
export function analyserPages(texte: string, total: number): { ok: true; pages: number[] } | { ok: false; message: string } {
  const pages: number[] = [];
  const t = texte.replace(/\s/g, "");
  if (!t) return { ok: false, message: "Indiquez les pages de cet acte, ex. « 3 » ou « 3-4 »." };
  for (const morceau of t.split(",")) {
    const m = morceau.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
    if (!m) return { ok: false, message: `« ${morceau} » n'est pas compris : écrivez par exemple « 3 » ou « 3-4 ».` };
    const [de, a] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (de < 1 || a > total || de > a) return { ok: false, message: `Pages ${de}-${a} : le PDF a ${total} page${total > 1 ? "s" : ""}.` };
    for (let p = de; p <= a; p++) if (!pages.includes(p - 1)) pages.push(p - 1);
  }
  if (pages.length > 20) return { ok: false, message: "20 pages au plus pour un acte." };
  return { ok: true, pages };
}

/** Pages proposées pour l'acte suivant : la page qui suit la dernière utilisée (même nombre de pages). */
export function pagesSuivantes(dernieres: number[] | null, total: number): string {
  if (!dernieres?.length) return total > 0 ? "1" : "";
  const debut = Math.max(...dernieres) + 2;
  if (debut > total) return "";
  const fin = Math.min(total, debut + dernieres.length - 1);
  return debut === fin ? String(debut) : `${debut}-${fin}`;
}

/** Avant de créer l'ancien acte : message si ce même fichier est déjà archivé, sinon null. */
export async function verifierEmpreinteEntite(supabase: SupabaseClient, empreinte: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("verifier_empreinte_entite", { p_empreinte: empreinte });
  if (error) throw new Error(message(error, "Vérification impossible"));
  return (data as string | null) ?? null;
}

/** Libellés du formulaire selon le type d'acte du lot. */
export function libellesNoms(modele: string): { titulaire: string; titulaire2: string | null } {
  switch (modele) {
    case "naissance":
      return { titulaire: "Nom de l'enfant (titulaire)", titulaire2: null };
    case "mariage":
      return { titulaire: "Nom de l'époux", titulaire2: "Nom de l'épouse" };
    case "deces":
      return { titulaire: "Nom du défunt", titulaire2: null };
    default:
      return { titulaire: "Nom du titulaire", titulaire2: null };
  }
}
