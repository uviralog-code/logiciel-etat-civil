/**
 * TARIFS DE L'ENTITÉ (fichier 25) — écran de l'officier, vue du caissier
 *
 * - les prix réellement demandés dans l'entité, ligne par ligne (un acte avec
 *   un tarif Étrangers distinct a deux lignes, comme dans la maquette) ;
 * - les ajustements en vigueur (bleu) et les changements à venir (jaune),
 *   qu'ils viennent de l'entité ou de la grille commune ;
 * - « Ajuster un tarif » et « Revenir à la grille commune » : contrôles,
 *   aperçu avant confirmation, enregistrement ; annulation d'un ajustement
 *   qui n'est pas encore en vigueur.
 *
 * La base reste la gardienne : seul l'officier de l'entité peut écrire
 * (fichier 08), au plus tôt pour demain (fichier 17), jamais dans le passé.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { nomCourt, type Entite } from "./comptes";
import {
  LIBELLE_CATEGORIE,
  MESSAGES_GRILLE,
  validerSaisie,
  type ChampTarif,
  type SaisieTarif,
  type TarifValide,
} from "./grille-commune";
import {
  aujourdhuiUvira,
  calculerGrille,
  formaterDate,
  formaterMontant,
  memePrix,
  prixApplicable,
  type Categorie,
  type Changement,
  type DonneesTarifaires,
  type LigneTarifEntite,
  type Prix,
  type PrixApplique,
  type TypeActe,
} from "./tarifs";

/** « Commune de Mulongwe » → « Tarifs de la commune de Mulongwe ». */
export function titreTarifs(nomEntite: string): string {
  return `Tarifs de la ${nomEntite.charAt(0).toLowerCase()}${nomEntite.slice(1)}`;
}

// ---------------------------------------------------------------------
// Le tableau
// ---------------------------------------------------------------------

export interface LigneTarifsEntite {
  cle: string;
  acte: TypeActe;
  categorie: Categorie;
  /** L'acte a un tarif Étrangers distinct : la catégorie est précisée. */
  distinct: boolean;
  commun: Prix | null;
  applique: PrixApplique | null;
  /** Ajustement de l'entité en vigueur aujourd'hui. */
  ajustement: { depuis: string; motif: string | null } | null;
  /** Comment le prix demandé dans l'entité va changer, date par date. */
  changements: Changement[];
}

export function lignesTarifsEntite(donnees: DonneesTarifaires, entiteId: string, aujourdhui: string): LigneTarifsEntite[] {
  const ajustements = donnees.ajustements.filter((a) => a.entite_id === entiteId);
  return calculerGrille(
    donnees.actes.filter((a) => a.actif),
    donnees.communs,
    ajustements,
    aujourdhui,
  ).flatMap(({ acte, categories }) =>
    categories.map((t) => ({
      cle: `${acte.id}-${t.categorie}`,
      acte,
      categorie: t.categorie,
      distinct: acte.tarif_distinct_etranger,
      commun: t.commun ? { montant: t.commun.montant, devise: t.commun.devise } : null,
      applique: t.applique,
      ajustement: t.ajustement ? { depuis: t.ajustement.depuis, motif: t.ajustement.motif } : null,
      changements: t.changements,
    })),
  );
}

/** « 20 000 FC à partir du 12/11/2026 », « 5 000 FC (grille commune) à partir du 01/11/2026 ». */
export function texteChangement(c: Changement): string {
  const quoi = c.prix
    ? `${formaterMontant(c.prix.montant, c.prix.devise)}${c.prix.source === "commune" ? " (grille commune)" : ""}`
    : "Sans prix";
  return `${quoi} à partir du ${formaterDate(c.date)}`;
}

// ---------------------------------------------------------------------
// Saisie : ajuster un tarif, ou revenir à la grille commune
// ---------------------------------------------------------------------

export type ModeAjustement = "prix" | "grille";

export interface SaisieAjustement extends SaisieTarif {
  mode: ModeAjustement;
}

export type AjustementValide =
  | (TarifValide & { mode: "prix" })
  | (Omit<TarifValide, "montant" | "devise"> & { mode: "grille" });

export type ValidationAjustement = { ok: true; valeurs: AjustementValide } | { ok: false; message: string; champ: ChampTarif };

export const MESSAGES_ENTITE = {
  doublon: "Un changement est déjà programmé pour ce tarif à cette date. Annulez-le d'abord dans « Ajustements programmés ».",
  refus: "Action réservée à l'officier d'état civil de l'entité.",
  dejaSurGrille: "À cette date, ce tarif suit déjà la grille commune : il n'y a pas d'ajustement à arrêter.",
  mode: "Choisissez : ajuster le prix, ou revenir à la grille commune.",
} as const;

/** Mêmes contrôles que la grille commune ; pour un retour à la grille, pas de montant. */
export function validerAjustement(saisie: SaisieAjustement, actes: TypeActe[], aujourdhui: string): ValidationAjustement {
  if (saisie.mode !== "prix" && saisie.mode !== "grille") return { ok: false, message: MESSAGES_ENTITE.mode, champ: "montant" };
  if (saisie.mode === "prix") {
    const r = validerSaisie(saisie, actes, aujourdhui);
    return r.ok ? { ok: true, valeurs: { ...r.valeurs, mode: "prix" } } : r;
  }
  // Retour à la grille : le montant n'est pas demandé (valeur neutre pour réutiliser les mêmes contrôles)
  const r = validerSaisie({ ...saisie, montant: "1", devise: "CDF" }, actes, aujourdhui);
  if (!r.ok) return r;
  const { acte, categorie, date, motif } = r.valeurs;
  return { ok: true, valeurs: { acte, categorie, date, motif, mode: "grille" } };
}

export interface ApercuAjustement {
  /** Prix demandé dans l'entité la veille de la date choisie. */
  avant: PrixApplique | null;
  /** Prix demandé à partir de la date choisie. */
  apres: PrixApplique | null;
  /** Le prix demandé ne change pas. */
  sansEffet: boolean;
  doublon: boolean;
  /** Retour à la grille alors que l'entité la suit déjà à cette date. */
  dejaSurGrille: boolean;
}

function veille(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function apercuAjustement(valeurs: AjustementValide, donnees: DonneesTarifaires, entiteId: string): ApercuAjustement {
  const { acte, categorie, date } = valeurs;
  const siens = donnees.ajustements.filter((a) => a.entite_id === entiteId);
  const nouvelle: LigneTarifEntite = {
    id: "apercu",
    entite_id: entiteId,
    type_acte_id: acte.id,
    categorie,
    en_vigueur_depuis: date,
    motif: valeurs.motif,
    ...(valeurs.mode === "prix"
      ? { suit_grille_commune: false, montant: valeurs.montant, devise: valeurs.devise }
      : { suit_grille_commune: true, montant: null, devise: null }),
  };
  const avant = prixApplicable(acte, categorie, donnees.communs, siens, veille(date));
  const apres = prixApplicable(acte, categorie, donnees.communs, [...siens.filter((a) => !(a.type_acte_id === acte.id && a.categorie === categorie && a.en_vigueur_depuis === date)), nouvelle], date);
  return {
    avant,
    apres,
    sansEffet: memePrix(avant, apres) && avant?.source === apres?.source,
    doublon: siens.some((a) => a.type_acte_id === acte.id && a.categorie === categorie && a.en_vigueur_depuis === date),
    dejaSurGrille: valeurs.mode === "grille" && avant?.source !== "entite",
  };
}

// ---------------------------------------------------------------------
// Ajustements programmés
// ---------------------------------------------------------------------

export interface AjustementProgramme {
  ligne: LigneTarifEntite;
  acte: TypeActe;
  avant: PrixApplique | null;
  apres: PrixApplique | null;
}

export function ajustementsProgrammes(donnees: DonneesTarifaires, entiteId: string, aujourdhui: string): AjustementProgramme[] {
  const actes = new Map(donnees.actes.map((a) => [a.id, a]));
  const siens = donnees.ajustements.filter((a) => a.entite_id === entiteId);
  return siens
    .filter((l) => l.en_vigueur_depuis > aujourdhui && actes.has(l.type_acte_id))
    .map((ligne) => {
      const acte = actes.get(ligne.type_acte_id)!;
      return {
        ligne,
        acte,
        avant: prixApplicable(acte, ligne.categorie, donnees.communs, siens, veille(ligne.en_vigueur_depuis)),
        apres: prixApplicable(acte, ligne.categorie, donnees.communs, siens, ligne.en_vigueur_depuis),
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
// Lecture et écriture dans la base
// ---------------------------------------------------------------------

/** L'entité de l'agent connecté (la base ne lui montre que la sienne). */
export async function lireEntite(supabase: SupabaseClient, code: string): Promise<Entite | null> {
  const { data, error } = await supabase.from("entites").select("id, code, nom").eq("code", code).maybeSingle<Entite>();
  if (error) throw new Error(`Lecture de l'entité impossible : ${error.message}`);
  return data;
}

export type ResultatAjustement = { ok: true; texte: string } | { ok: false; message: string; champ?: ChampTarif };

function messageDeLaBase(erreur: { code?: string; message: string }): { message: string; champ?: ChampTarif } {
  if (erreur.code === "23505") return { message: MESSAGES_ENTITE.doublon, champ: "date" };
  if (erreur.code === "42501") return { message: MESSAGES_ENTITE.refus };
  if (erreur.code === "P0001") return { message: erreur.message, champ: /tarif entre en vigueur/.test(erreur.message) ? "date" : undefined };
  return { message: `La base de données a refusé l'enregistrement : ${erreur.message}` };
}

/** Enregistre un ajustement (ou un retour à la grille commune) pour l'entité de l'officier connecté. */
export async function programmerAjustement(
  supabase: SupabaseClient,
  entite: Pick<Entite, "id" | "nom">,
  saisie: SaisieAjustement,
  aujourdhui = aujourdhuiUvira(),
): Promise<ResultatAjustement> {
  const { data: acte, error: erreurActe } = await supabase
    .from("types_actes")
    .select("id, numero, code, libelle, famille, tarif_distinct_etranger, couleur, actif")
    .eq("id", String(saisie.acteId ?? ""))
    .maybeSingle<TypeActe>();
  if (erreurActe && erreurActe.code !== "22P02") return { ok: false, ...messageDeLaBase(erreurActe) };

  const controle = validerAjustement(saisie, acte ? [acte] : [], aujourdhui);
  if (!controle.ok) return controle;
  const v = controle.valeurs;

  const { data, error } = await supabase
    .from("tarifs_entites")
    .insert({
      entite_id: entite.id,
      type_acte_id: v.acte.id,
      categorie: v.categorie,
      en_vigueur_depuis: v.date,
      motif: v.motif,
      ...(v.mode === "prix"
        ? { suit_grille_commune: false, montant: v.montant, devise: v.devise }
        : { suit_grille_commune: true, montant: null, devise: null }),
    })
    .select("id");
  if (error) return { ok: false, ...messageDeLaBase(error) };
  if (!data?.length) return { ok: false, message: MESSAGES_ENTITE.refus };

  const categorie = v.acte.tarif_distinct_etranger ? ` (${LIBELLE_CATEGORIE[v.categorie]})` : "";
  const quoi = v.mode === "prix" ? formaterMontant(v.montant, v.devise) : "retour à la grille commune";
  return { ok: true, texte: `${v.acte.code}${categorie} : ${quoi} à partir du ${formaterDate(v.date)}, pour ${nomCourt(entite.nom)}.` };
}

/** Annule un ajustement de l'entité qui n'est PAS encore en vigueur. */
export async function annulerAjustement(
  supabase: SupabaseClient,
  id: string,
  aujourdhui = aujourdhuiUvira(),
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("tarifs_entites")
    .delete()
    .eq("id", String(id))
    .gt("en_vigueur_depuis", aujourdhui)
    .select("id");
  if (error) {
    if (error.code === "P0001" || error.code === "22P02") return { ok: false, message: MESSAGES_GRILLE.dejaEnVigueur };
    return { ok: false, message: messageDeLaBase(error).message };
  }
  if (!data?.length) return { ok: false, message: MESSAGES_GRILLE.dejaEnVigueur };
  return { ok: true };
}
