/**
 * CATALOGUE ET TARIFS — OUTILS COMMUNS (fichier 23)
 *
 * Utilisés par les écrans « Grille commune » (administrateur), « Tarifs de
 * l'entité » (officier, caissier) et « Taux du jour » (caissier).
 *
 * Le prix d'un acte suit EXACTEMENT les règles de la base (fonction
 * tarif_applicable, fichier 03) — les tests le vérifient ligne par ligne :
 *   a) un acte sans tarif Étrangers distinct se paie au tarif national ;
 *   b) l'ajustement le plus récent de l'entité l'emporte, sauf s'il annonce
 *      le retour à la grille commune ;
 *   c) sinon, la ligne la plus récente de la grille commune.
 * Un tarif programmé prend effet au plus tôt le lendemain (migration 17).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise, FamilleActe } from "./charte";

export const FUSEAU_UVIRA = "Africa/Lubumbashi";
export type Categorie = "national" | "etranger";

export interface TypeActe {
  id: string;
  numero: number;
  code: string;
  libelle: string;
  famille: FamilleActe;
  tarif_distinct_etranger: boolean;
  couleur: string | null;
  actif: boolean;
}

export interface LigneTarifCommun {
  id: string;
  type_acte_id: string;
  categorie: Categorie;
  montant: number;
  devise: Devise;
  en_vigueur_depuis: string; // AAAA-MM-JJ
  motif: string | null;
}

export interface LigneTarifEntite {
  id: string;
  entite_id: string;
  type_acte_id: string;
  categorie: Categorie;
  suit_grille_commune: boolean;
  montant: number | null;
  devise: Devise | null;
  en_vigueur_depuis: string;
  motif: string | null;
}

export interface Prix {
  montant: number;
  devise: Devise;
}

export interface PrixApplique extends Prix {
  source: "commune" | "entite";
  depuis: string;
}

export interface Changement {
  date: string;
  prix: PrixApplique | null;
}

export interface TarifCategorie {
  categorie: Categorie;
  /** Grille commune en vigueur aujourd'hui. */
  commun: (Prix & { depuis: string; motif: string | null }) | null;
  /** Ajustement de l'entité en vigueur aujourd'hui (vide : l'entité suit la grille commune). */
  ajustement: (Prix & { depuis: string; motif: string | null }) | null;
  /** Prix réellement demandé aujourd'hui. */
  applique: PrixApplique | null;
  /** Lignes déjà programmées (dates futures), dans l'ordre. */
  communsAVenir: LigneTarifCommun[];
  ajustementsAVenir: LigneTarifEntite[];
  /** Comment le prix demandé va changer, date par date. */
  changements: Changement[];
}

export interface LigneGrille {
  acte: TypeActe;
  categories: TarifCategorie[];
}

// ---------------------------------------------------------------------
// Dates (heure d'Uvira, comme la base)
// ---------------------------------------------------------------------

/** « 2026-10-14 » : la date du jour à Uvira. */
export function aujourdhuiUvira(maintenant = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: FUSEAU_UVIRA }).format(
    maintenant,
  );
}

/** Le lendemain d'une date « AAAA-MM-JJ » : premier jour possible pour un nouveau tarif. */
export function lendemain(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** « 2026-11-12 » → « 12/11/2026 ». */
export function formaterDate(date: string): string {
  const [a, m, j] = date.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// ---------------------------------------------------------------------
// Montants
// ---------------------------------------------------------------------

const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** « 18 000 FC », « 30 $ », « 0,5 $ ». */
export function formaterMontant(montant: number, devise: Devise): string {
  return `${nombre.format(Number(montant))} ${devise === "CDF" ? "FC" : "$"}`;
}

/** « 2 850 FC pour 1 $ ». */
export function formaterTaux(taux: number): string {
  return `${nombre.format(Number(taux))} FC pour 1 $`;
}

/**
 * Montant en francs congolais (même calcul que la base, migration 24) : un tarif en
 * francs reste au franc ; des dollars × le taux sont arrondis à la centaine la plus
 * proche (7 182,5 → 7 200 FC), jamais moins de 100 FC. Vide si dollars sans taux.
 * Le calcul se fait en nombres entiers (centimes × centièmes) pour éviter les
 * erreurs d'arrondi des nombres à virgule.
 */
export function convertirEnCdf(montant: number, devise: Devise, taux: number | null): number | null {
  if (devise === "CDF") return Math.round(Number(montant));
  if (taux == null) return null;
  // produit × 10 000, en entier exact
  const produit = Math.round(Number(montant) * 100) * Math.round(Number(taux) * 100);
  if (produit <= 0) return 0;
  const UNITE = 1_000_000; // 100 FC × 10 000
  const centaines = Math.floor(produit / UNITE) + (2 * (produit % UNITE) >= UNITE ? 1 : 0);
  return Math.max(centaines * 100, 100);
}

/** Deux prix identiques ? */
export function memePrix(a: Prix | null, b: Prix | null): boolean {
  if (!a || !b) return a === b;
  return a.devise === b.devise && Number(a.montant) === Number(b.montant);
}

// ---------------------------------------------------------------------
// Le bon prix (règles de la base)
// ---------------------------------------------------------------------

function plusRecente<T extends { en_vigueur_depuis: string }>(lignes: T[], date: string): T | undefined {
  return lignes
    .filter((l) => l.en_vigueur_depuis <= date)
    .sort((a, b) => b.en_vigueur_depuis.localeCompare(a.en_vigueur_depuis))[0];
}

/** Prix demandé pour un acte, une catégorie et une date — identique à tarif_applicable. */
export function prixApplicable(
  acte: TypeActe,
  categorieDemandee: Categorie,
  communs: LigneTarifCommun[],
  ajustements: LigneTarifEntite[],
  date: string,
): PrixApplique | null {
  const categorie: Categorie = acte.tarif_distinct_etranger ? categorieDemandee : "national";
  const local = plusRecente(
    ajustements.filter((t) => t.type_acte_id === acte.id && t.categorie === categorie),
    date,
  );
  if (local && !local.suit_grille_commune && local.montant != null && local.devise) {
    return { montant: Number(local.montant), devise: local.devise, source: "entite", depuis: local.en_vigueur_depuis };
  }
  const commun = plusRecente(
    communs.filter((t) => t.type_acte_id === acte.id && t.categorie === categorie),
    date,
  );
  return commun ? { montant: Number(commun.montant), devise: commun.devise, source: "commune", depuis: commun.en_vigueur_depuis } : null;
}

/**
 * La grille complète, acte par acte (dans l'ordre des numéros de la fiche officielle).
 * Sans ajustements (liste vide) : la grille commune telle qu'elle s'applique partout.
 */
export function calculerGrille(
  actes: TypeActe[],
  communs: LigneTarifCommun[],
  ajustements: LigneTarifEntite[],
  aujourdhui: string,
): LigneGrille[] {
  return [...actes]
    .sort((a, b) => a.numero - b.numero)
    .map((acte) => {
      const categories: Categorie[] = acte.tarif_distinct_etranger ? ["national", "etranger"] : ["national"];
      return {
        acte,
        categories: categories.map((categorie): TarifCategorie => {
          const siens = <T extends { type_acte_id: string; categorie: Categorie }>(l: T[]) =>
            l.filter((t) => t.type_acte_id === acte.id && t.categorie === categorie);
          const communsActe = siens(communs);
          const ajustementsActe = siens(ajustements);
          const communDuJour = plusRecente(communsActe, aujourdhui);
          const ajustementDuJour = plusRecente(ajustementsActe, aujourdhui);
          const applique = prixApplicable(acte, categorie, communs, ajustements, aujourdhui);

          const communsAVenir = communsActe
            .filter((t) => t.en_vigueur_depuis > aujourdhui)
            .sort((a, b) => a.en_vigueur_depuis.localeCompare(b.en_vigueur_depuis));
          const ajustementsAVenir = ajustementsActe
            .filter((t) => t.en_vigueur_depuis > aujourdhui)
            .sort((a, b) => a.en_vigueur_depuis.localeCompare(b.en_vigueur_depuis));

          // Le prix demandé, à chaque date où quelque chose est programmé
          const dates = [...new Set([...communsAVenir, ...ajustementsAVenir].map((t) => t.en_vigueur_depuis))].sort();
          const changements: Changement[] = [];
          let precedent: PrixApplique | null = applique;
          for (const date of dates) {
            const prix = prixApplicable(acte, categorie, communs, ajustements, date);
            if (!memePrix(prix, precedent) || prix?.source !== precedent?.source) changements.push({ date, prix });
            precedent = prix;
          }

          return {
            categorie,
            commun: communDuJour
              ? { montant: Number(communDuJour.montant), devise: communDuJour.devise, depuis: communDuJour.en_vigueur_depuis, motif: communDuJour.motif }
              : null,
            ajustement:
              ajustementDuJour && !ajustementDuJour.suit_grille_commune && ajustementDuJour.montant != null && ajustementDuJour.devise
                ? {
                    montant: Number(ajustementDuJour.montant),
                    devise: ajustementDuJour.devise,
                    depuis: ajustementDuJour.en_vigueur_depuis,
                    motif: ajustementDuJour.motif,
                  }
                : null,
            applique,
            communsAVenir,
            ajustementsAVenir,
            changements,
          };
        }),
      };
    });
}

// ---------------------------------------------------------------------
// Lecture dans la base (droits de la personne connectée)
// ---------------------------------------------------------------------

export interface DonneesTarifaires {
  actes: TypeActe[];
  communs: LigneTarifCommun[];
  ajustements: LigneTarifEntite[];
}

/**
 * Catalogue, grille commune et ajustements d'une entité (ou de toutes, pour
 * l'administrateur, si `entiteId` est absent).
 */
export async function lireDonneesTarifaires(
  supabase: SupabaseClient,
  options: { entiteId?: string | null; inclureInactifs?: boolean } = {},
): Promise<DonneesTarifaires> {
  let requeteActes = supabase
    .from("types_actes")
    .select("id, numero, code, libelle, famille, tarif_distinct_etranger, couleur, actif")
    .order("numero");
  if (!options.inclureInactifs) requeteActes = requeteActes.eq("actif", true);

  let requeteAjustements = supabase
    .from("tarifs_entites")
    .select("id, entite_id, type_acte_id, categorie, suit_grille_commune, montant, devise, en_vigueur_depuis, motif");
  if (options.entiteId) requeteAjustements = requeteAjustements.eq("entite_id", options.entiteId);

  const [actes, communs, ajustements] = await Promise.all([
    requeteActes.returns<TypeActe[]>(),
    supabase
      .from("tarifs_communs")
      .select("id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif")
      .returns<LigneTarifCommun[]>(),
    requeteAjustements.returns<LigneTarifEntite[]>(),
  ]);
  for (const r of [actes, communs, ajustements]) {
    if (r.error) throw new Error(`Lecture des tarifs impossible : ${r.error.message}`);
  }
  return { actes: actes.data ?? [], communs: communs.data ?? [], ajustements: ajustements.data ?? [] };
}

/** Taux du jour d'une entité (vide si aucun taux n'a encore été saisi). */
export async function lireTauxEnVigueur(
  supabase: SupabaseClient,
  entiteId: string,
): Promise<{ taux: number; depuis: string } | null> {
  const { data, error } = await supabase
    .from("taux_change")
    .select("taux, en_vigueur_depuis")
    .eq("entite_id", entiteId)
    .lte("en_vigueur_depuis", new Date().toISOString())
    .order("en_vigueur_depuis", { ascending: false })
    .limit(1)
    .maybeSingle<{ taux: number; en_vigueur_depuis: string }>();
  if (error) throw new Error(`Lecture du taux impossible : ${error.message}`);
  return data ? { taux: Number(data.taux), depuis: data.en_vigueur_depuis } : null;
}
