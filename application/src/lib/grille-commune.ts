/**
 * GRILLE TARIFAIRE COMMUNE (fichier 24) — écran de l'administrateur
 *
 * - les écarts des entités (ajustements en vigueur ou programmés), signalés en jaune ;
 * - les changements déjà programmés de la grille commune ;
 * - la saisie d'un nouveau tarif commun : contrôles, aperçu avant confirmation,
 *   enregistrement ; annulation d'un changement qui n'est pas encore en vigueur.
 *
 * La base reste la gardienne des règles (droits de l'administrateur vérifié,
 * date d'effet au plus tôt le lendemain, historique intouchable) : les contrôles
 * faits ici servent à donner un message clair AVANT d'envoyer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise } from "./charte";
import { ORDRE_ENTITES, type Entite } from "./comptes";
import {
  aujourdhuiUvira,
  formaterDate,
  formaterMontant,
  lendemain,
  memePrix,
  prixApplicable,
  type Categorie,
  type DonneesTarifaires,
  type LigneTarifCommun,
  type LigneTarifEntite,
  type Prix,
  type TypeActe,
} from "./tarifs";

export const LIBELLE_CATEGORIE: Record<Categorie, string> = { national: "National", etranger: "Étranger" };
export const LIBELLE_DEVISE: Record<Devise, string> = { USD: "$", CDF: "FC" };

/** Plafonds contre les fautes de frappe (un zéro de trop). */
export const MONTANT_MAXIMUM: Record<Devise, number> = { CDF: 100_000_000, USD: 100_000 };
/** On ne programme pas un tarif plus de 2 ans à l'avance (faute de frappe sur l'année). */
export const ANNEES_MAXIMUM = 2;

/** « 22 · Extrait d'acte de naissance » */
export function libelleActe(acte: Pick<TypeActe, "numero" | "libelle">): string {
  return `${String(acte.numero).padStart(2, "0")} · ${acte.libelle}`;
}

export function trierEntites<T extends Pick<Entite, "code" | "nom">>(entites: T[]): T[] {
  const ordre = (e: T) => {
    const i = ORDRE_ENTITES.indexOf(e.code);
    return i < 0 ? ORDRE_ENTITES.length : i;
  };
  return [...entites].sort((a, b) => ordre(a) - ordre(b) || a.nom.localeCompare(b.nom, "fr"));
}

/** « 12/11 » dans l'année en cours, « 12/11/2027 » sinon. */
function dateCourte(date: string, aujourdhui: string): string {
  return date.slice(0, 4) === aujourdhui.slice(0, 4) ? formaterDate(date).slice(0, 5) : formaterDate(date);
}

function plusRecente<T extends { en_vigueur_depuis: string }>(lignes: T[], date: string, strictement = false): T | undefined {
  return lignes
    .filter((l) => (strictement ? l.en_vigueur_depuis < date : l.en_vigueur_depuis <= date))
    .sort((a, b) => b.en_vigueur_depuis.localeCompare(a.en_vigueur_depuis))[0];
}

// ---------------------------------------------------------------------
// Écarts des entités
// ---------------------------------------------------------------------

export interface Ecart {
  entite: string; // code : MUL, KAV…
  categorie: Categorie;
  texte: string; // « MUL : 20 000 FC dès le 12/11 »
  aVenir: boolean;
}

/**
 * Ce que chaque entité a changé chez elle pour cet acte, comme dans la maquette :
 * « MUL : 4 000 FC depuis le 01/09 », « MUL : 20 000 FC dès le 12/11 »,
 * « MUL : retour à la grille dès le 01/11 ».
 */
export function ecartsDesEntites(
  acte: TypeActe,
  entites: Pick<Entite, "id" | "code" | "nom">[],
  ajustements: LigneTarifEntite[],
  aujourdhui: string,
): Ecart[] {
  const categories: Categorie[] = acte.tarif_distinct_etranger ? ["national", "etranger"] : ["national"];
  const ecarts: Ecart[] = [];
  for (const entite of trierEntites(entites)) {
    for (const categorie of categories) {
      const lignes = ajustements.filter((a) => a.entite_id === entite.id && a.type_acte_id === acte.id && a.categorie === categorie);
      const prefixe = `${entite.code}${categorie === "etranger" ? " · Étr." : ""} : `;
      const enVigueur = plusRecente(lignes, aujourdhui);
      if (enVigueur && !enVigueur.suit_grille_commune && enVigueur.montant != null && enVigueur.devise) {
        ecarts.push({
          entite: entite.code,
          categorie,
          aVenir: false,
          texte: `${prefixe}${formaterMontant(enVigueur.montant, enVigueur.devise)} depuis le ${dateCourte(enVigueur.en_vigueur_depuis, aujourdhui)}`,
        });
      }
      for (const l of lignes.filter((x) => x.en_vigueur_depuis > aujourdhui).sort((a, b) => a.en_vigueur_depuis.localeCompare(b.en_vigueur_depuis))) {
        const quoi = l.suit_grille_commune || l.montant == null || !l.devise ? "retour à la grille" : formaterMontant(l.montant, l.devise);
        ecarts.push({ entite: entite.code, categorie, aVenir: true, texte: `${prefixe}${quoi} dès le ${dateCourte(l.en_vigueur_depuis, aujourdhui)}` });
      }
    }
  }
  return ecarts;
}

// ---------------------------------------------------------------------
// Résumé et changements programmés
// ---------------------------------------------------------------------

export interface ResumeGrille {
  /** Date du dernier changement entré en vigueur. */
  depuis: string | null;
  actes: number;
  tarifs: number;
  programmes: number;
}

/** « Grille en vigueur depuis le 01/01/2026 · 26 actes · 32 tarifs » */
export function resumeGrille(donnees: DonneesTarifaires, aujourdhui: string): ResumeGrille {
  const actifs = donnees.actes.filter((a) => a.actif);
  const ids = new Set(actifs.map((a) => a.id));
  const communs = donnees.communs.filter((c) => ids.has(c.type_acte_id));
  const enVigueur = communs.filter((c) => c.en_vigueur_depuis <= aujourdhui);
  const tarifs = actifs.reduce(
    (n, a) =>
      n + (a.tarif_distinct_etranger ? ["national", "etranger"] : ["national"]).filter((cat) =>
        enVigueur.some((c) => c.type_acte_id === a.id && c.categorie === cat),
      ).length,
    0,
  );
  return {
    depuis: enVigueur.map((c) => c.en_vigueur_depuis).sort().at(-1) ?? null,
    actes: actifs.length,
    tarifs,
    programmes: communs.length - enVigueur.length,
  };
}

export interface ChangementProgramme {
  ligne: LigneTarifCommun;
  acte: TypeActe;
  /** Prix de la grille commune la veille de ce changement. */
  avant: Prix | null;
}

/** Les changements de la grille commune pas encore en vigueur, du plus proche au plus lointain. */
export function changementsProgrammes(donnees: DonneesTarifaires, aujourdhui: string): ChangementProgramme[] {
  const actes = new Map(donnees.actes.map((a) => [a.id, a]));
  return donnees.communs
    .filter((c) => c.en_vigueur_depuis > aujourdhui && actes.has(c.type_acte_id))
    .map((ligne) => {
      const precedent = plusRecente(
        donnees.communs.filter((c) => c.type_acte_id === ligne.type_acte_id && c.categorie === ligne.categorie),
        ligne.en_vigueur_depuis,
        true,
      );
      return {
        ligne,
        acte: actes.get(ligne.type_acte_id)!,
        avant: precedent ? { montant: Number(precedent.montant), devise: precedent.devise } : null,
      };
    })
    .sort(
      (a, b) =>
        a.ligne.en_vigueur_depuis.localeCompare(b.ligne.en_vigueur_depuis) ||
        a.acte.numero - b.acte.numero ||
        a.ligne.categorie.localeCompare(b.ligne.categorie),
    );
}

// ---------------------------------------------------------------------
// Saisie d'un nouveau tarif commun
// ---------------------------------------------------------------------

export interface SaisieTarif {
  acteId: string;
  categorie: string;
  montant: string;
  devise: string;
  date: string; // AAAA-MM-JJ (champ date du navigateur)
  motif: string;
}

export type ChampTarif = "acte" | "categorie" | "montant" | "devise" | "date" | "motif";

export interface TarifValide {
  acte: TypeActe;
  categorie: Categorie;
  montant: number;
  devise: Devise;
  date: string;
  motif: string;
}

export type Validation = { ok: true; valeurs: TarifValide } | { ok: false; message: string; champ: ChampTarif };

export const MESSAGES_GRILLE = {
  acte: "Choisissez l'acte dont le tarif change.",
  categorie: "Choisissez la catégorie : National ou Étranger.",
  montant: "Tapez le nouveau montant en chiffres, par exemple 35 ou 18 000.",
  montantZero: "Le montant doit être supérieur à zéro.",
  centimes: "Les francs congolais s'écrivent sans centimes.",
  decimales: "Deux chiffres au plus après la virgule.",
  devise: "Choisissez la monnaie : $ ou FC.",
  date: "Choisissez la date d'entrée en vigueur.",
  motif: "Indiquez la référence de la décision (arrêté, décision…), en 3 caractères au moins.",
  motifLong: "La référence de la décision ne doit pas dépasser 300 caractères.",
  doublon: "Un changement est déjà programmé pour cet acte à cette date. Annulez-le d'abord dans « Changements programmés ».",
  refus: "Action réservée à l'administrateur connecté avec son code de vérification.",
  dejaEnVigueur: "Ce changement est déjà entré en vigueur, ou il a déjà été annulé : il ne peut plus être annulé.",
} as const;

/** « 18 000 » → 18000 ; « 0,5 » → 0.5. Renvoie un message si le montant n'est pas valable. */
export function lireMontant(texte: string, devise: Devise): number | string {
  const nettoye = texte.replace(/[\s  ]/g, "");
  if (!/^\d+([.,]\d+)?$/.test(nettoye)) return MESSAGES_GRILLE.montant;
  const [, decimales = ""] = nettoye.split(/[.,]/);
  if (devise === "CDF" && /[1-9]/.test(decimales)) return MESSAGES_GRILLE.centimes;
  if (decimales.replace(/0+$/, "").length > 2) return MESSAGES_GRILLE.decimales;
  const montant = Number(nettoye.replace(",", "."));
  if (!(montant > 0)) return MESSAGES_GRILLE.montantZero;
  if (montant > MONTANT_MAXIMUM[devise]) {
    return `Montant trop élevé : ${formaterMontant(montant, devise)}. Vérifiez qu'il n'y a pas un zéro de trop (au plus ${formaterMontant(MONTANT_MAXIMUM[devise], devise)}).`;
  }
  return montant;
}

function dateValable(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Date d'entrée en vigueur d'un tarif : au plus tôt demain, au plus tard dans 2 ans. Renvoie le message d'erreur, ou vide. */
export function controlerDateEffet(date: string, aujourdhui: string): string | null {
  if (!dateValable(date)) return MESSAGES_GRILLE.date;
  const premierJour = lendemain(aujourdhui);
  if (date < premierJour) {
    return `Un nouveau tarif entre en vigueur au plus tôt demain (le ${formaterDate(premierJour)}) : les prix ne changent jamais en cours de journée, ni dans le passé.`;
  }
  const limite = `${Number(aujourdhui.slice(0, 4)) + ANNEES_MAXIMUM}${aujourdhui.slice(4)}`;
  if (date > limite) return `Date trop lointaine : au plus tard le ${formaterDate(limite)}. Vérifiez l'année.`;
  return null;
}

/** Référence de la décision, nettoyée ; « » si trop courte ; une erreur si trop longue. */
export function lireMotif(texte: string | null | undefined): string | { ok: false; message: string; champ: "motif" } {
  const motif = (texte ?? "").trim().replace(/\s+/g, " ");
  if (motif.length < 3) return "";
  if (motif.length > 300) return { ok: false, message: MESSAGES_GRILLE.motifLong, champ: "motif" };
  return motif;
}

/** Contrôle complet d'une saisie (fait dans le navigateur ET refait sur le serveur). */
export function validerSaisie(saisie: SaisieTarif, actes: TypeActe[], aujourdhui: string): Validation {
  const acte = actes.find((a) => a.id === saisie.acteId && a.actif);
  if (!acte) return { ok: false, message: MESSAGES_GRILLE.acte, champ: "acte" };

  if (saisie.categorie !== "national" && saisie.categorie !== "etranger") {
    return { ok: false, message: MESSAGES_GRILLE.categorie, champ: "categorie" };
  }
  if (saisie.categorie === "etranger" && !acte.tarif_distinct_etranger) {
    return { ok: false, message: `« ${acte.libelle} » n'a qu'un seul tarif : les étrangers paient le tarif national.`, champ: "categorie" };
  }
  if (saisie.devise !== "USD" && saisie.devise !== "CDF") return { ok: false, message: MESSAGES_GRILLE.devise, champ: "devise" };
  const devise: Devise = saisie.devise;

  const montant = lireMontant(saisie.montant ?? "", devise);
  if (typeof montant === "string") return { ok: false, message: montant, champ: "montant" };

  const date = (saisie.date ?? "").trim();
  const erreurDate = controlerDateEffet(date, aujourdhui);
  if (erreurDate) return { ok: false, message: erreurDate, champ: "date" };
  const motif = lireMotif(saisie.motif);
  if (typeof motif !== "string" || motif === "") return motif === "" ? { ok: false, message: MESSAGES_GRILLE.motif, champ: "motif" } : motif;

  return { ok: true, valeurs: { acte, categorie: saisie.categorie, montant, devise, date, motif } };
}

// ---------------------------------------------------------------------
// Aperçu avant confirmation
// ---------------------------------------------------------------------

export interface Apercu {
  /** Prix de la grille commune aujourd'hui. */
  actuel: Prix | null;
  /** Prix de la grille commune la veille de la date choisie (différent d'« actuel » si un autre changement est déjà programmé entre-temps). */
  veille: Prix | null;
  /** Le nouveau prix est le même que celui de la veille : la ligne ne changerait rien. */
  identique: boolean;
  /** Une ligne existe déjà pour cet acte, cette catégorie et cette date. */
  doublon: boolean;
  /** Entités qui, à cette date, gardent leur propre prix (ajustement local). */
  entitesAjustees: { code: string; prix: Prix }[];
}

export function apercuChangement(
  valeurs: TarifValide,
  donnees: DonneesTarifaires,
  entites: Pick<Entite, "id" | "code" | "nom">[],
  aujourdhui: string,
): Apercu {
  const { acte, categorie, date } = valeurs;
  const communs = donnees.communs.filter((c) => c.type_acte_id === acte.id && c.categorie === categorie);
  const prix = (l: LigneTarifCommun | undefined): Prix | null => (l ? { montant: Number(l.montant), devise: l.devise } : null);
  const veille = prix(plusRecente(communs, date, true));
  const entitesAjustees = trierEntites(entites).flatMap((e) => {
    const p = prixApplicable(
      acte,
      categorie,
      donnees.communs,
      donnees.ajustements.filter((a) => a.entite_id === e.id),
      date,
    );
    return p?.source === "entite" ? [{ code: e.code, prix: { montant: p.montant, devise: p.devise } }] : [];
  });
  return {
    actuel: prix(plusRecente(communs, aujourdhui)),
    veille,
    identique: memePrix(veille, { montant: valeurs.montant, devise: valeurs.devise }),
    doublon: communs.some((c) => c.en_vigueur_depuis === date),
    entitesAjustees,
  };
}

// ---------------------------------------------------------------------
// Lecture et écriture dans la base
// ---------------------------------------------------------------------

export async function lireEntites(supabase: SupabaseClient): Promise<Entite[]> {
  const { data, error } = await supabase.from("entites").select("id, code, nom").returns<Entite[]>();
  if (error) throw new Error(`Lecture des entités impossible : ${error.message}`);
  return trierEntites(data ?? []);
}

export type ResultatProgrammation =
  | { ok: true; texte: string }
  | { ok: false; message: string; champ?: ChampTarif };

/** Traduit un refus de la base en message clair. */
function messageDeLaBase(erreur: { code?: string; message: string }): { message: string; champ?: ChampTarif } {
  if (erreur.code === "23505") return { message: MESSAGES_GRILLE.doublon, champ: "date" };
  if (erreur.code === "42501") return { message: MESSAGES_GRILLE.refus };
  if (erreur.code === "P0001") return { message: erreur.message, champ: /tarif entre en vigueur/.test(erreur.message) ? "date" : undefined };
  return { message: `La base de données a refusé l'enregistrement : ${erreur.message}` };
}

/**
 * Enregistre un nouveau tarif commun (avec les droits de l'administrateur connecté).
 * Le contrôle est refait ici avec l'acte tel qu'il est dans la base.
 */
export async function programmerTarifCommun(
  supabase: SupabaseClient,
  saisie: SaisieTarif,
  aujourdhui = aujourdhuiUvira(),
): Promise<ResultatProgrammation> {
  const { data: acte, error: erreurActe } = await supabase
    .from("types_actes")
    .select("id, numero, code, libelle, famille, tarif_distinct_etranger, couleur, actif")
    .eq("id", String(saisie.acteId ?? ""))
    .maybeSingle<TypeActe>();
  if (erreurActe && erreurActe.code !== "22P02") return { ok: false, ...messageDeLaBase(erreurActe) };

  const controle = validerSaisie(saisie, acte ? [acte] : [], aujourdhui);
  if (!controle.ok) return controle;
  const v = controle.valeurs;

  const { data, error } = await supabase
    .from("tarifs_communs")
    .insert({ type_acte_id: v.acte.id, categorie: v.categorie, montant: v.montant, devise: v.devise, en_vigueur_depuis: v.date, motif: v.motif })
    .select("id");
  if (error) return { ok: false, ...messageDeLaBase(error) };
  // Sans le droit d'écrire, la base n'insère rien et ne renvoie rien
  if (!data?.length) return { ok: false, message: MESSAGES_GRILLE.refus };

  const categorie = v.acte.tarif_distinct_etranger ? ` (${LIBELLE_CATEGORIE[v.categorie]})` : "";
  return {
    ok: true,
    texte: `${v.acte.code}${categorie} : ${formaterMontant(v.montant, v.devise)} à partir du ${formaterDate(v.date)}, pour les 4 entités.`,
  };
}

export type ResultatAnnulation = { ok: true } | { ok: false; message: string };

/** Annule un changement de la grille commune qui n'est PAS encore en vigueur. */
export async function annulerTarifCommun(
  supabase: SupabaseClient,
  id: string,
  aujourdhui = aujourdhuiUvira(),
): Promise<ResultatAnnulation> {
  const { data, error } = await supabase
    .from("tarifs_communs")
    .delete()
    .eq("id", String(id))
    .gt("en_vigueur_depuis", aujourdhui)
    .select("id");
  if (error) {
    if (error.code === "P0001") return { ok: false, message: MESSAGES_GRILLE.dejaEnVigueur };
    if (error.code === "22P02") return { ok: false, message: MESSAGES_GRILLE.dejaEnVigueur };
    return { ok: false, message: messageDeLaBase(error).message };
  }
  if (!data?.length) return { ok: false, message: MESSAGES_GRILLE.dejaEnVigueur };
  return { ok: true };
}
