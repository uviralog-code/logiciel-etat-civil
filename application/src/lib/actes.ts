/**
 * ACTES — OUTILS COMMUNS (fichier 28)
 *
 * Utilisés par « Nouvel acte » (29), l'accueil de l'officier (30), la fiche
 * d'un acte (31), la recherche (32) et l'archivage (33 à 35).
 *
 * - les champs de chaque fiche (naissance, mariage, décès, simple), d'après la
 *   maquette « Nouvel acte — Fiche » ;
 * - le contrôle d'une saisie (fait dans le navigateur ET refait sur le serveur) ;
 * - l'enregistrement et la correction d'un acte AVEC sa fiche, en une seule
 *   opération (fonctions enregistrer_acte et corriger_acte, migration 19) ;
 * - la lecture d'un acte complet.
 *
 * L'ID, le prix et le statut sont toujours calculés par la base.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Devise, FamilleActe, StatutActe } from "./charte";
import type { ModeleFiche } from "./catalogue";
import type { Categorie } from "./tarifs";

// ---------------------------------------------------------------------
// Les fiches
// ---------------------------------------------------------------------

export type TypeChamp = "texte" | "date" | "sexe" | "nombre";

export interface ChampFiche {
  cle: string;
  libelle: string;
  type: TypeChamp;
  obligatoire: boolean;
  aide?: string;
}

export interface DescriptionFiche {
  /** Titre de la partie « titulaire » de la fiche. */
  titreTitulaire: string;
  libelleTitulaire: string;
  /** Second titulaire (le second époux pour un mariage). */
  libelleTitulaire2?: string;
  champs: ChampFiche[];
}

export const FICHES: Record<ModeleFiche, DescriptionFiche> = {
  naissance: {
    titreTitulaire: "L'enfant (titulaire de l'acte)",
    libelleTitulaire: "Nom complet (nom, postnom, prénom)",
    champs: [
      { cle: "sexe", libelle: "Sexe", type: "sexe", obligatoire: true },
      { cle: "date_naissance", libelle: "Date de naissance", type: "date", obligatoire: true },
      { cle: "lieu_naissance", libelle: "Lieu de naissance", type: "texte", obligatoire: false },
      { cle: "nom_pere", libelle: "Nom du père", type: "texte", obligatoire: false },
      { cle: "nom_mere", libelle: "Nom de la mère", type: "texte", obligatoire: false },
    ],
  },
  mariage: {
    titreTitulaire: "Les époux (titulaires de l'acte)",
    libelleTitulaire: "Nom complet de l'époux",
    libelleTitulaire2: "Nom complet de l'épouse",
    champs: [
      { cle: "date_celebration", libelle: "Date de célébration", type: "date", obligatoire: true },
      { cle: "lieu_celebration", libelle: "Lieu de célébration", type: "texte", obligatoire: false },
      { cle: "temoins", libelle: "Témoins", type: "texte", obligatoire: false, aide: "Noms des témoins, séparés par des virgules." },
    ],
  },
  deces: {
    titreTitulaire: "Le défunt (titulaire de l'acte)",
    libelleTitulaire: "Nom complet (nom, postnom, prénom)",
    champs: [
      { cle: "sexe", libelle: "Sexe", type: "sexe", obligatoire: false },
      { cle: "date_deces", libelle: "Date du décès", type: "date", obligatoire: true },
      { cle: "lieu_deces", libelle: "Lieu du décès", type: "texte", obligatoire: false },
      { cle: "age_au_deces", libelle: "Âge au décès (ans)", type: "nombre", obligatoire: false },
      { cle: "declarant_nom", libelle: "Nom du déclarant", type: "texte", obligatoire: false },
    ],
  },
  generique: {
    titreTitulaire: "Le titulaire (bénéficiaire de l'acte)",
    libelleTitulaire: "Nom complet (nom, postnom, prénom)",
    champs: [],
  },
};

// ---------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------

export interface TypeActePourSaisie {
  id: string;
  code: string;
  libelle: string;
  modele_fiche: ModeleFiche;
  tarif_distinct_etranger: boolean;
  actif: boolean;
}

export interface SaisieActe {
  typeActeId: string;
  categorie: string;
  titulaire: string;
  titulaire2: string;
  demandeur: string;
  telephone: string;
  observations: string;
  details: Record<string, string>;
}

export type ChampActe = "type" | "categorie" | "titulaire" | "titulaire2" | "demandeur" | "telephone" | "observations" | string;

export interface ActeValide {
  type: TypeActePourSaisie;
  categorie: Categorie;
  titulaire: string;
  titulaire2: string | null;
  demandeur: string | null;
  telephone: string | null;
  observations: string | null;
  details: Record<string, string | number>;
}

type Refus = { ok: false; message: string; champ?: ChampActe };

export const MESSAGES_ACTE = {
  type: "Choisissez d'abord le type d'acte.",
  typeRetire: "Ce type d'acte a été retiré du catalogue : il ne peut plus être enregistré.",
  categorie: "Indiquez la nationalité du demandeur : congolaise ou étrangère.",
  nomCourt: "Écrivez le nom complet (3 caractères au moins).",
  nomLong: "Ce nom est trop long (150 caractères au plus).",
  telephone: "Numéro de téléphone incomplet ou mal écrit (ex. +243 990 000 000).",
  observations: "Les observations ne doivent pas dépasser 500 caractères.",
  refus: "Action réservée à l'officier d'état civil de l'entité.",
} as const;

/** Espaces en trop retirés. */
export function nettoyerNom(texte: string | null | undefined): string {
  return (texte ?? "").replace(/\s+/g, " ").trim();
}

function validerNom(texte: string, champ: ChampActe, obligatoire: boolean): Refus | string | null {
  const nom = nettoyerNom(texte);
  if (!nom) return obligatoire ? { ok: false, message: MESSAGES_ACTE.nomCourt, champ } : null;
  if (nom.length < 3) return { ok: false, message: MESSAGES_ACTE.nomCourt, champ };
  if (nom.length > 150) return { ok: false, message: MESSAGES_ACTE.nomLong, champ };
  return nom;
}

function dateValable(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Contrôle complet d'une saisie d'acte. */
export function validerSaisieActe(
  s: SaisieActe,
  type: TypeActePourSaisie | undefined,
  aujourdhui: string,
): { ok: true; valeurs: ActeValide } | Refus {
  if (!type || type.id !== s.typeActeId) return { ok: false, message: MESSAGES_ACTE.type, champ: "type" };
  if (!type.actif) return { ok: false, message: MESSAGES_ACTE.typeRetire, champ: "type" };
  const fiche = FICHES[type.modele_fiche];

  const titulaire = validerNom(s.titulaire, "titulaire", true);
  if (typeof titulaire !== "string") return titulaire!;
  let titulaire2: string | null = null;
  if (fiche.libelleTitulaire2) {
    const t2 = validerNom(s.titulaire2, "titulaire2", true);
    if (typeof t2 !== "string") return t2!;
    titulaire2 = t2;
  }

  const details: Record<string, string | number> = {};
  for (const champ of fiche.champs) {
    const valeur = (s.details?.[champ.cle] ?? "").trim();
    if (!valeur) {
      if (champ.obligatoire) return { ok: false, message: `${champ.libelle} : à remplir.`, champ: champ.cle };
      continue;
    }
    if (champ.type === "sexe") {
      if (valeur !== "M" && valeur !== "F") return { ok: false, message: `${champ.libelle} : choisissez masculin ou féminin.`, champ: champ.cle };
      details[champ.cle] = valeur;
    } else if (champ.type === "date") {
      if (!dateValable(valeur)) return { ok: false, message: `${champ.libelle} : date invalide.`, champ: champ.cle };
      if (valeur > aujourdhui) return { ok: false, message: `${champ.libelle} : la date ne peut pas être dans le futur.`, champ: champ.cle };
      if (valeur < "1900-01-01") return { ok: false, message: `${champ.libelle} : vérifiez l'année.`, champ: champ.cle };
      details[champ.cle] = valeur;
    } else if (champ.type === "nombre") {
      const n = Number(valeur);
      if (!Number.isInteger(n) || n < 0 || n > 130) return { ok: false, message: `${champ.libelle} : un nombre entier entre 0 et 130.`, champ: champ.cle };
      details[champ.cle] = n;
    } else {
      const texte = nettoyerNom(valeur);
      if (texte.length > 200) return { ok: false, message: `${champ.libelle} : 200 caractères au plus.`, champ: champ.cle };
      details[champ.cle] = texte;
    }
  }

  const demandeur = validerNom(s.demandeur, "demandeur", false);
  if (demandeur && typeof demandeur !== "string") return demandeur;

  const telephone = nettoyerNom(s.telephone);
  if (telephone && !/^\+?[\d\s.-]{6,20}$/.test(telephone)) return { ok: false, message: MESSAGES_ACTE.telephone, champ: "telephone" };

  if (s.categorie !== "national" && s.categorie !== "etranger") return { ok: false, message: MESSAGES_ACTE.categorie, champ: "categorie" };

  const observations = (s.observations ?? "").trim();
  if (observations.length > 500) return { ok: false, message: MESSAGES_ACTE.observations, champ: "observations" };

  return {
    ok: true,
    valeurs: {
      type,
      categorie: s.categorie,
      titulaire,
      titulaire2,
      demandeur: (demandeur as string | null) || null,
      telephone: telephone || null,
      observations: observations || null,
      details,
    },
  };
}

// ---------------------------------------------------------------------
// Base de données
// ---------------------------------------------------------------------

export interface LigneActe {
  id: string;
  identifiant: string;
  entite_id: string;
  type_acte_id: string;
  annee: number;
  numero_ordre: number;
  origine: "nouveau" | "archive_ancienne";
  numero_registre: string | null;
  titulaire_nom: string;
  titulaire_2_nom: string | null;
  demandeur_nom: string | null;
  demandeur_telephone: string | null;
  categorie: Categorie;
  montant_du: number | null;
  devise_du: Devise | null;
  statut: StatutActe;
  date_acte: string;
  delivre_le: string | null;
  annule_le: string | null;
  motif_annulation: string | null;
  motif_renvoi: string | null;
  renvoye_le: string | null;
  observations: string | null;
  cree_le: string;
  modifie_le: string;
}

export interface ActeComplet extends LigneActe {
  type: { code: string; libelle: string; famille: FamilleActe; couleur: string | null; modele_fiche: ModeleFiche; tarif_distinct_etranger: boolean };
  entite: { code: string; nom: string };
  /** La fiche de détails (vide pour une fiche simple). */
  details: Record<string, string | number | null> | null;
}

const SELECTION_ACTE = `*,
  type:types_actes(code, libelle, famille, couleur, modele_fiche, tarif_distinct_etranger),
  entite:entites(code, nom),
  naissance:details_naissance(sexe, date_naissance, lieu_naissance, nom_pere, nom_mere),
  mariage:details_mariage(date_celebration, lieu_celebration, temoins),
  deces:details_deces(sexe, date_deces, lieu_deces, age_au_deces, declarant_nom)`;

type LigneLue = LigneActe & {
  type: ActeComplet["type"];
  entite: ActeComplet["entite"];
  naissance: Record<string, string | number | null> | null;
  mariage: Record<string, string | number | null> | null;
  deces: Record<string, string | number | null> | null;
};

/** Un acte avec son type, son entité et sa fiche (la base ne montre que ce que l'agent a le droit de voir). */
export async function lireActe(supabase: SupabaseClient, id: string): Promise<ActeComplet | null> {
  const { data, error } = await supabase.from("actes").select(SELECTION_ACTE).eq("id", id).maybeSingle<LigneLue>();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`Lecture de l'acte impossible : ${error.message}`);
  }
  if (!data) return null;
  const { naissance, mariage, deces, ...acte } = data;
  return { ...acte, montant_du: acte.montant_du == null ? null : Number(acte.montant_du), details: naissance ?? mariage ?? deces ?? null };
}

/** Pré-remplit le formulaire de correction à partir d'un acte. */
export function saisieDepuisActe(acte: ActeComplet): SaisieActe {
  const details: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(acte.details ?? {})) if (valeur != null) details[cle] = String(valeur);
  return {
    typeActeId: acte.type_acte_id,
    categorie: acte.categorie,
    titulaire: acte.titulaire_nom,
    titulaire2: acte.titulaire_2_nom ?? "",
    demandeur: acte.demandeur_nom ?? "",
    telephone: acte.demandeur_telephone ?? "",
    observations: acte.observations ?? "",
    details,
  };
}

export type ResultatActe =
  | { ok: true; acte: Pick<LigneActe, "id" | "identifiant" | "statut" | "montant_du" | "devise_du"> }
  | Refus;

function messageDeLaBase(e: { code?: string; message: string }): Refus {
  if (e.code === "42501") return { ok: false, message: MESSAGES_ACTE.refus };
  if (e.code === "P0001") return { ok: false, message: e.message };
  if (e.code === "23514" || e.code === "22007" || e.code === "22008") {
    return { ok: false, message: "Une information de la fiche n'est pas valable (date ou nombre). Vérifiez la saisie." };
  }
  return { ok: false, message: `La base de données a refusé l'enregistrement : ${e.message}` };
}

const parametres = (v: ActeValide, transmettre: boolean) => ({
  p_categorie: v.categorie,
  p_titulaire_nom: v.titulaire,
  p_titulaire_2_nom: v.titulaire2,
  p_demandeur_nom: v.demandeur,
  p_demandeur_telephone: v.telephone,
  p_observations: v.observations,
  p_details: v.details,
  p_transmettre: transmettre,
});

async function lireType(supabase: SupabaseClient, id: string): Promise<TypeActePourSaisie | undefined> {
  const { data } = await supabase
    .from("types_actes")
    .select("id, code, libelle, modele_fiche, tarif_distinct_etranger, actif")
    .eq("id", id)
    .maybeSingle<TypeActePourSaisie>();
  return data ?? undefined;
}

const reponse = (data: LigneActe): ResultatActe => ({
  ok: true,
  acte: { id: data.id, identifiant: data.identifiant, statut: data.statut, montant_du: data.montant_du == null ? null : Number(data.montant_du), devise_du: data.devise_du },
});

/** Enregistre un nouvel acte et sa fiche ; « transmettre » l'envoie aussitôt au Caissier. */
export async function enregistrerActe(
  supabase: SupabaseClient,
  saisie: SaisieActe,
  transmettre: boolean,
  aujourdhui: string,
): Promise<ResultatActe> {
  const type = /^[0-9a-f-]{36}$/i.test(saisie.typeActeId ?? "") ? await lireType(supabase, saisie.typeActeId) : undefined;
  const controle = validerSaisieActe(saisie, type, aujourdhui);
  if (!controle.ok) return controle;
  const { data, error } = await supabase
    .rpc("enregistrer_acte", { p_type_acte: controle.valeurs.type.id, ...parametres(controle.valeurs, transmettre) })
    .single<LigneActe>();
  if (error) return messageDeLaBase(error);
  return reponse(data);
}

/** Corrige un acte et sa fiche ; « transmettre » le renvoie au Caissier s'il est « enregistré ». */
export async function corrigerActe(
  supabase: SupabaseClient,
  id: string,
  saisie: SaisieActe,
  transmettre: boolean,
  aujourdhui: string,
): Promise<ResultatActe> {
  const acte = /^[0-9a-f-]{36}$/i.test(id ?? "") ? await lireActe(supabase, id) : null;
  if (!acte) return { ok: false, message: "Acte introuvable." };
  const type = await lireType(supabase, acte.type_acte_id);
  // Le type d'un acte ne change jamais : on contrôle avec le sien, même s'il a été retiré depuis
  const controle = validerSaisieActe({ ...saisie, typeActeId: acte.type_acte_id }, type && { ...type, actif: true }, aujourdhui);
  if (!controle.ok) return controle;
  const { data, error } = await supabase
    .rpc("corriger_acte", { p_acte: id, ...parametres(controle.valeurs, transmettre) })
    .single<LigneActe>();
  if (error) return messageDeLaBase(error);
  return reponse(data);
}

/** Transmet au Caissier un acte « enregistré » (il passe « en attente de paiement »). */
export async function transmettreActe(supabase: SupabaseClient, id: string): Promise<ResultatActe> {
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return { ok: false, message: "Acte introuvable." };
  const { data, error } = await supabase
    .from("actes")
    .update({ statut: "en_attente_paiement" })
    .eq("id", id)
    .eq("statut", "enregistre")
    .select("*")
    .returns<LigneActe[]>();
  if (error) return messageDeLaBase(error);
  if (!data?.length) return { ok: false, message: "Cet acte n'est plus « enregistré » (déjà transmis ou annulé), ou il n'appartient pas à votre entité." };
  return reponse(data[0]);
}


// ---------------------------------------------------------------------
// Fiche d'un acte (fichier 31) : correction d'un nom, délivrance, annulation
// ---------------------------------------------------------------------

export interface SaisieNoms {
  titulaire: string;
  titulaire2: string;
  demandeur: string;
  motif: string;
}

const idValable = (id: string) => /^[0-9a-f-]{36}$/i.test(id ?? "");

/** Corrige l'orthographe des noms d'un acte payé, exonéré ou délivré (motif obligatoire, inscrit au journal). */
export async function corrigerNomActe(supabase: SupabaseClient, id: string, s: SaisieNoms, deuxEpoux: boolean): Promise<ResultatActe> {
  if (!idValable(id)) return { ok: false, message: "Acte introuvable." };
  const titulaire = validerNom(s.titulaire, "titulaire", true);
  if (typeof titulaire !== "string") return titulaire!;
  let titulaire2: string | null = null;
  if (deuxEpoux) {
    const t2 = validerNom(s.titulaire2, "titulaire2", true);
    if (typeof t2 !== "string") return t2!;
    titulaire2 = t2;
  }
  const demandeur = validerNom(s.demandeur, "demandeur", false);
  if (demandeur && typeof demandeur !== "string") return demandeur;
  const motif = nettoyerNom(s.motif);
  if (motif.length < 3) return { ok: false, message: "Indiquez le motif de la correction (3 caractères au moins) : il est inscrit au journal d'audit.", champ: "motif" };
  if (motif.length > 300) return { ok: false, message: "Le motif ne doit pas dépasser 300 caractères.", champ: "motif" };

  const { data, error } = await supabase
    .rpc("corriger_nom_acte", { p_acte: id, p_titulaire_nom: titulaire, p_titulaire_2_nom: titulaire2, p_demandeur_nom: demandeur || null, p_motif: motif })
    .single<LigneActe>();
  if (error) return messageDeLaBase(error);
  return reponse(data);
}

/** Marque « délivré » un acte payé ou exonéré (le document est remis au demandeur). */
export async function delivrerActe(supabase: SupabaseClient, id: string): Promise<ResultatActe> {
  if (!idValable(id)) return { ok: false, message: "Acte introuvable." };
  const { data, error } = await supabase
    .from("actes")
    .update({ statut: "delivre" })
    .eq("id", id)
    .in("statut", ["paye", "exonere"])
    .select("*")
    .returns<LigneActe[]>();
  if (error) return messageDeLaBase(error);
  if (!data?.length) return { ok: false, message: "Seul un acte payé ou exonéré peut être marqué « délivré »." };
  return reponse(data[0]);
}

/** Annule un acte pas encore payé (définitif, motif obligatoire). Un acte payé s'annule par la caisse. */
export async function annulerActe(supabase: SupabaseClient, id: string, motif: string): Promise<ResultatActe> {
  if (!idValable(id)) return { ok: false, message: "Acte introuvable." };
  const m = nettoyerNom(motif);
  if (m.length < 3) return { ok: false, message: "Indiquez le motif de l'annulation (3 caractères au moins).", champ: "motif" };
  if (m.length > 300) return { ok: false, message: "Le motif ne doit pas dépasser 300 caractères.", champ: "motif" };
  const { data, error } = await supabase
    .from("actes")
    .update({ statut: "annule", motif_annulation: m })
    .eq("id", id)
    .in("statut", ["enregistre", "en_attente_paiement"])
    .select("*")
    .returns<LigneActe[]>();
  if (error) return messageDeLaBase(error);
  if (!data?.length) {
    return { ok: false, message: "Cet acte ne peut plus être annulé ici : s'il est payé, le Caissier doit annuler son reçu (avant la clôture)." };
  }
  return reponse(data[0]);
}
