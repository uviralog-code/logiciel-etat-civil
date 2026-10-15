/**
 * CATALOGUE DES ACTES (fichier 27) — écran de l'administrateur
 *
 * - la liste des types d'actes, au catalogue ou retirés, avec leur prix actuel ;
 * - retirer / remettre un type d'acte (jamais de suppression, migration 18) ;
 * - corriger le libellé, la famille ou la couleur (le reste est figé) ;
 * - ajouter un type d'acte AVEC son prix, en une seule opération
 *   (fonction ajouter_type_acte de la base), au plus tôt pour demain.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAMILLES, type Devise, type FamilleActe } from "./charte";
import { controlerDateEffet, lireMontant, lireMotif } from "./grille-commune";
import { lendemain, type DonneesTarifaires, type Prix, type TypeActe } from "./tarifs";

export type ModeleFiche = "naissance" | "mariage" | "deces" | "generique";

export const MODELES_FICHE: Record<ModeleFiche, string> = {
  naissance: "Naissance (enfant, parents, date et lieu)",
  mariage: "Mariage (époux, date et lieu de célébration)",
  deces: "Décès (défunt, date et lieu)",
  generique: "Simple (nom, demandeur, observations)",
};

/** Couleurs du catalogue (charte des maquettes). */
export const COULEURS_ACTES: { valeur: string; nom: string }[] = [
  { valeur: "#2E7D32", nom: "Vert (naissance)" },
  { valeur: "#6A1B9A", nom: "Violet (mariage)" },
  { valeur: "#455A64", nom: "Gris foncé (décès)" },
  { valeur: "#1565C0", nom: "Bleu (attestations)" },
  { valeur: "#00727C", nom: "Turquoise (certificats)" },
  { valeur: "#BF360C", nom: "Orange (autorisations)" },
  { valeur: "#374151", nom: "Gris (extraits)" },
];

/** Couleur proposée : celle du modèle de fiche pour l'état civil, sinon celle de la famille. */
export function couleurProposee(famille: FamilleActe, modele: ModeleFiche): string {
  if (modele === "naissance") return "#2E7D32";
  if (modele === "mariage") return "#6A1B9A";
  if (modele === "deces") return "#455A64";
  return FAMILLES[famille].couleur === "#0B3D91" ? "#1565C0" : FAMILLES[famille].couleur;
}

/** Numéro proposé pour un nouveau type : le suivant sur la fiche officielle. */
export function prochainNumero(actes: Pick<TypeActe, "numero">[]): number {
  return actes.reduce((max, a) => Math.max(max, a.numero), 0) + 1;
}

/** « attestation » → « ATTESTATION » ; lettres sans accents, rien d'autre. */
export function nettoyerCode(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

const comparable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------

export interface LigneCatalogue {
  acte: TypeActe & { modele_fiche: ModeleFiche };
  /** Prix commun en vigueur aujourd'hui, par catégorie. */
  national: Prix | null;
  etranger: Prix | null;
  /** Pour un type tout neuf : date à laquelle son premier prix entre en vigueur. */
  disponibleLe: string | null;
}

export function lignesCatalogue(
  actes: (TypeActe & { modele_fiche: ModeleFiche })[],
  communs: DonneesTarifaires["communs"],
  aujourdhui: string,
): LigneCatalogue[] {
  const prix = (id: string, categorie: "national" | "etranger") => {
    const l = communs
      .filter((c) => c.type_acte_id === id && c.categorie === categorie && c.en_vigueur_depuis <= aujourdhui)
      .sort((a, b) => b.en_vigueur_depuis.localeCompare(a.en_vigueur_depuis))[0];
    return l ? { montant: Number(l.montant), devise: l.devise } : null;
  };
  return [...actes]
    .sort((a, b) => a.numero - b.numero)
    .map((acte) => {
      const national = prix(acte.id, "national");
      const premier = communs
        .filter((c) => c.type_acte_id === acte.id && c.en_vigueur_depuis > aujourdhui)
        .map((c) => c.en_vigueur_depuis)
        .sort()[0];
      return {
        acte,
        national,
        etranger: acte.tarif_distinct_etranger ? prix(acte.id, "etranger") : null,
        disponibleLe: national ? null : (premier ?? null),
      };
    });
}

// ---------------------------------------------------------------------
// Saisie d'un nouveau type d'acte
// ---------------------------------------------------------------------

export interface SaisieTypeActe {
  numero: string;
  code: string;
  libelle: string;
  famille: string;
  modele: string;
  couleur: string;
  distinctEtranger: boolean;
  montantNational: string;
  deviseNational: string;
  montantEtranger: string;
  deviseEtranger: string;
  date: string;
  motif: string;
}

export type ChampCatalogue =
  | "numero" | "code" | "libelle" | "famille" | "modele" | "couleur"
  | "montantNational" | "montantEtranger" | "date" | "motif";

export interface TypeActeValide {
  numero: number;
  code: string;
  libelle: string;
  famille: FamilleActe;
  modele: ModeleFiche;
  couleur: string;
  distinctEtranger: boolean;
  national: Prix;
  etranger: Prix | null;
  date: string;
  motif: string;
}

type Refus = { ok: false; message: string; champ?: ChampCatalogue };

export const MESSAGES_CATALOGUE = {
  numero: "Indiquez le numéro de l'acte sur la fiche officielle (un nombre entier).",
  code: "Le code compte de 2 à 6 lettres majuscules, sans chiffre ni tiret (ex. ATBVM). Il figurera dans l'ID de chaque acte.",
  libelle: "Indiquez le nom de l'acte, en 3 caractères au moins.",
  libelleLong: "Le nom de l'acte ne doit pas dépasser 200 caractères.",
  famille: "Choisissez la famille de l'acte.",
  modele: "Choisissez la fiche de détails à remplir pour cet acte.",
  couleur: "Choisissez une couleur.",
  devise: "Choisissez la monnaie : $ ou FC.",
  refus: "Action réservée à l'administrateur connecté avec son code de vérification.",
  introuvable: "Ce type d'acte n'existe plus dans le catalogue.",
} as const;

const estFamille = (f: string): f is FamilleActe => f in FAMILLES;
const estModele = (m: string): m is ModeleFiche => m in MODELES_FICHE;
const estDevise = (d: string): d is Devise => d === "USD" || d === "CDF";
const estCouleur = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);

/** Libellé, famille, couleur : communs à l'ajout et à la correction. */
function validerDescription(
  s: { libelle: string; famille: string; couleur: string },
  actes: Pick<TypeActe, "id" | "libelle">[],
  sauf?: string,
): Refus | { libelle: string; famille: FamilleActe; couleur: string } {
  const libelle = (s.libelle ?? "").trim().replace(/\s+/g, " ");
  if (libelle.length < 3) return { ok: false, message: MESSAGES_CATALOGUE.libelle, champ: "libelle" };
  if (libelle.length > 200) return { ok: false, message: MESSAGES_CATALOGUE.libelleLong, champ: "libelle" };
  const doublon = actes.find((a) => a.id !== sauf && comparable(a.libelle) === comparable(libelle));
  if (doublon) return { ok: false, message: `Un acte porte déjà ce nom : « ${doublon.libelle} ».`, champ: "libelle" };
  if (!estFamille(s.famille)) return { ok: false, message: MESSAGES_CATALOGUE.famille, champ: "famille" };
  if (!estCouleur(s.couleur ?? "")) return { ok: false, message: MESSAGES_CATALOGUE.couleur, champ: "couleur" };
  return { libelle, famille: s.famille, couleur: s.couleur.toUpperCase() };
}

function validerPrix(montant: string, devise: string, champ: ChampCatalogue): Refus | Prix {
  if (!estDevise(devise)) return { ok: false, message: MESSAGES_CATALOGUE.devise, champ };
  const m = lireMontant(montant ?? "", devise);
  if (typeof m === "string") return { ok: false, message: m, champ };
  return { montant: m, devise };
}

/** Contrôle complet d'un nouveau type d'acte (fait dans le navigateur ET refait sur le serveur). */
export function validerNouveauType(
  s: SaisieTypeActe,
  actes: Pick<TypeActe, "id" | "numero" | "code" | "libelle">[],
  aujourdhui: string,
): { ok: true; valeurs: TypeActeValide } | Refus {
  const numero = Number(String(s.numero ?? "").trim());
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) return { ok: false, message: MESSAGES_CATALOGUE.numero, champ: "numero" };
  const pris = actes.find((a) => a.numero === numero);
  if (pris) return { ok: false, message: `Le numéro ${numero} est déjà celui de « ${pris.libelle} ».`, champ: "numero" };

  const code = String(s.code ?? "").trim();
  if (!/^[A-Z]{2,6}$/.test(code)) return { ok: false, message: MESSAGES_CATALOGUE.code, champ: "code" };
  const memeCode = actes.find((a) => a.code === code);
  if (memeCode) return { ok: false, message: `Le code ${code} est déjà celui de « ${memeCode.libelle} ».`, champ: "code" };

  const description = validerDescription(s, actes);
  if ("ok" in description) return description;
  if (!estModele(s.modele)) return { ok: false, message: MESSAGES_CATALOGUE.modele, champ: "modele" };

  const national = validerPrix(s.montantNational, s.deviseNational, "montantNational");
  if ("ok" in national) return national;
  let etranger: Prix | null = null;
  if (s.distinctEtranger) {
    const e = validerPrix(s.montantEtranger, s.deviseEtranger, "montantEtranger");
    if ("ok" in e) return e;
    etranger = e;
  }

  const date = String(s.date ?? "").trim();
  const erreurDate = controlerDateEffet(date, aujourdhui);
  if (erreurDate) return { ok: false, message: erreurDate, champ: "date" };
  const motif = lireMotif(s.motif);
  if (typeof motif !== "string") return motif;
  if (motif === "") return { ok: false, message: "Indiquez la référence de la décision (arrêté, décision…), en 3 caractères au moins.", champ: "motif" };

  return {
    ok: true,
    valeurs: { numero, code, ...description, modele: s.modele, distinctEtranger: Boolean(s.distinctEtranger), national, etranger, date, motif },
  };
}

export interface SaisieCorrection {
  libelle: string;
  famille: string;
  couleur: string;
}

export function validerCorrection(id: string, s: SaisieCorrection, actes: Pick<TypeActe, "id" | "libelle">[]) {
  if (!actes.some((a) => a.id === id)) return { ok: false as const, message: MESSAGES_CATALOGUE.introuvable };
  const d = validerDescription(s, actes, id);
  if ("ok" in d) return d;
  return { ok: true as const, valeurs: d };
}

// ---------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------

const SELECTION = "id, numero, code, libelle, famille, modele_fiche, tarif_distinct_etranger, couleur, actif";
type TypeActeComplet = TypeActe & { modele_fiche: ModeleFiche };

export async function lireTypesActes(supabase: SupabaseClient): Promise<TypeActeComplet[]> {
  const { data, error } = await supabase.from("types_actes").select(SELECTION).order("numero").returns<TypeActeComplet[]>();
  if (error) throw new Error(`Lecture du catalogue impossible : ${error.message}`);
  return data ?? [];
}

function messageDeLaBase(e: { code?: string; message: string }): Refus {
  if (e.code === "42501") return { ok: false, message: MESSAGES_CATALOGUE.refus };
  if (e.code === "23505") {
    if (e.message.includes("numero")) return { ok: false, message: "Ce numéro est déjà utilisé par un autre acte.", champ: "numero" };
    if (e.message.includes("code")) return { ok: false, message: "Ce code est déjà utilisé par un autre acte.", champ: "code" };
    if (e.message.includes("libelle")) return { ok: false, message: "Un acte porte déjà ce nom.", champ: "libelle" };
  }
  if (e.code === "23514" && e.message.includes("code_format")) return { ok: false, message: MESSAGES_CATALOGUE.code, champ: "code" };
  if (e.code === "P0001") return { ok: false, message: e.message, champ: /tarif entre en vigueur/.test(e.message) ? "date" : undefined };
  return { ok: false, message: `La base de données a refusé l'enregistrement : ${e.message}` };
}

export type ResultatCatalogue = { ok: true; texte: string } | Refus;

/** Ajoute un type d'acte avec son prix (une seule opération dans la base). */
export async function ajouterTypeActe(supabase: SupabaseClient, saisie: SaisieTypeActe, aujourdhui: string): Promise<ResultatCatalogue> {
  const controle = validerNouveauType(saisie, await lireTypesActes(supabase), aujourdhui);
  if (!controle.ok) return controle;
  const v = controle.valeurs;
  const { error } = await supabase.rpc("ajouter_type_acte", {
    p_numero: v.numero,
    p_code: v.code,
    p_libelle: v.libelle,
    p_famille: v.famille,
    p_modele_fiche: v.modele,
    p_distinct_etranger: v.distinctEtranger,
    p_couleur: v.couleur,
    p_montant_national: v.national.montant,
    p_devise_national: v.national.devise,
    p_montant_etranger: v.etranger?.montant ?? null,
    p_devise_etranger: v.etranger?.devise ?? null,
    p_en_vigueur_depuis: v.date,
    p_motif: v.motif,
  });
  if (error) return messageDeLaBase(error);
  const quand = v.date === lendemain(aujourdhui) ? "dès demain" : `à partir du ${v.date.split("-").reverse().join("/")}`;
  return { ok: true, texte: `${v.code} — ${v.libelle} : ajouté au catalogue, disponible ${quand}.` };
}

/** Corrige le libellé, la famille ou la couleur. */
export async function corrigerTypeActe(supabase: SupabaseClient, id: string, saisie: SaisieCorrection): Promise<ResultatCatalogue> {
  const controle = validerCorrection(String(id), saisie, await lireTypesActes(supabase));
  if (!controle.ok) return controle;
  const { data, error } = await supabase.from("types_actes").update(controle.valeurs).eq("id", String(id)).select("code");
  if (error) return messageDeLaBase(error);
  if (!data?.length) return { ok: false, message: MESSAGES_CATALOGUE.refus };
  return { ok: true, texte: `${data[0].code} : corrigé.` };
}

/** Retire un type d'acte du catalogue, ou l'y remet. */
export async function changerPresence(supabase: SupabaseClient, id: string, actif: boolean): Promise<ResultatCatalogue> {
  const { data, error } = await supabase.from("types_actes").update({ actif }).eq("id", String(id)).select("code, libelle");
  if (error) return error.code === "22P02" ? { ok: false, message: MESSAGES_CATALOGUE.introuvable } : messageDeLaBase(error);
  if (!data?.length) return { ok: false, message: MESSAGES_CATALOGUE.refus };
  return { ok: true, texte: `${data[0].code} — ${data[0].libelle} : ${actif ? "remis au catalogue" : "retiré du catalogue"}.` };
}
