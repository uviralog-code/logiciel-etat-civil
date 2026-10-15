/**
 * « NOUVEL ACTE » (fichier 29) — outils des deux écrans de l'officier
 *
 * 1. Choix du type (maquette « Nouvel acte — Type ») : les actes du catalogue,
 *    regroupés par famille, avec le prix appliqué dans l'entité, et un filtre.
 * 2. Fiche (maquette « Nouvel acte — Fiche ») : le prix selon la nationalité
 *    du demandeur, son équivalent en francs au taux du jour, l'ID prévu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FAMILLES, type FamilleActe } from "./charte";
import type { ModeleFiche } from "./catalogue";
import type { LigneTarifsEntite } from "./tarifs-entite";
import { convertirEnCdf, formaterMontant, type Categorie, type Prix, type TypeActe } from "./tarifs";

/** Ordre des familles à l'écran (celui de la maquette). */
export const ORDRE_FAMILLES: FamilleActe[] = ["acte_etat_civil", "extrait", "attestation", "certificat", "autorisation"];

export interface CarteActe {
  acte: TypeActe;
  /** « 30 $ », « National 18 000 FC · Étranger 39 000 FC » */
  prix: string;
  /** Pas encore de prix aujourd'hui (type tout neuf) : date à laquelle il devient disponible. */
  disponibleLe: string | null;
}

export interface GroupeFamille {
  famille: FamilleActe;
  nom: string;
  couleur: string;
  cartes: CarteActe[];
}

/** Regroupe les lignes du tableau des tarifs de l'entité (fichier 25) en cartes, par famille. */
export function cartesParFamille(lignes: LigneTarifsEntite[]): GroupeFamille[] {
  const parActe = new Map<string, LigneTarifsEntite[]>();
  for (const l of lignes) parActe.set(l.acte.id, [...(parActe.get(l.acte.id) ?? []), l]);

  const cartes: CarteActe[] = [...parActe.values()].map((ls) => {
    const acte = ls[0].acte;
    const nat = ls.find((l) => l.categorie === "national");
    const etr = ls.find((l) => l.categorie === "etranger");
    const texte = (p: Prix | null | undefined) => (p ? formaterMontant(p.montant, p.devise) : "—");
    const prix = acte.tarif_distinct_etranger
      ? `National ${texte(nat?.applique)} · Étranger ${texte(etr?.applique)}`
      : texte(nat?.applique);
    const premier = nat?.changements.find((c) => c.prix)?.date ?? null;
    return { acte, prix, disponibleLe: nat?.applique ? null : premier };
  });

  return ORDRE_FAMILLES.map((famille) => ({
    famille,
    nom: FAMILLES[famille].libelle,
    couleur: famille === "extrait" ? "#374151" : FAMILLES[famille].couleur,
    cartes: cartes.filter((c) => c.acte.famille === famille).sort((a, b) => a.acte.numero - b.acte.numero),
  })).filter((g) => g.cartes.length > 0);
}

const simplifier = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtre « naissance », « célibat », « exnais », « 22 »… (sans tenir compte des accents ni des majuscules). */
export function filtrerGroupes(groupes: GroupeFamille[], filtre: string): GroupeFamille[] {
  const mots = simplifier(filtre).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return groupes;
  return groupes
    .map((g) => ({
      ...g,
      cartes: g.cartes.filter((c) => {
        const texte = simplifier(`${c.acte.libelle} ${c.acte.code} ${String(c.acte.numero).padStart(2, "0")} ${g.nom}`);
        return mots.every((m) => texte.includes(m));
      }),
    }))
    .filter((g) => g.cartes.length > 0);
}

// ---------------------------------------------------------------------
// Fiche : prix, équivalent en francs, ID prévu
// ---------------------------------------------------------------------

export interface PrixAffiche {
  /** « 30 $ » */
  montant: string;
  /** « soit 85 500 FC au taux du jour (2 850 FC pour 1 $) », ou un avertissement. */
  equivalent: string | null;
}

export function prixAffiche(prix: Prix | null, taux: number | null): PrixAffiche | null {
  if (!prix) return null;
  const montant = formaterMontant(prix.montant, prix.devise);
  if (prix.devise === "CDF") return { montant, equivalent: null };
  if (taux == null) return { montant, equivalent: "Le Caissier n'a pas encore saisi de taux : l'équivalent en francs sera calculé à la caisse." };
  return {
    montant,
    equivalent: `soit ${formaterMontant(convertirEnCdf(prix.montant, "USD", taux)!, "CDF")} au taux du jour (${formaterMontant(taux, "CDF").replace(" FC", "")} FC pour 1 $)`,
  };
}

/** Prix demandé selon la catégorie (un acte sans tarif Étrangers distinct a un seul prix). */
export function prixSelonCategorie(lignes: LigneTarifsEntite[], acteId: string, categorie: Categorie): Prix | null {
  const ls = lignes.filter((l) => l.acte.id === acteId);
  const l = ls.find((x) => x.categorie === categorie) ?? ls.find((x) => x.categorie === "national");
  return l?.applique ? { montant: l.applique.montant, devise: l.applique.devise } : null;
}

/** « MUL-EXNAIS-2026-000125 » : l'ID que la base donnera au prochain acte de ce type. */
export function idPrevu(codeEntite: string, codeType: string, annee: number, dernierNumero: number): string {
  return `${codeEntite}-${codeType}-${annee}-${String(dernierNumero + 1).padStart(6, "0")}`;
}

/** Plus grand numéro d'ordre déjà attribué (les actes annulés comptent : un numéro ne sert qu'une fois). */
export async function lireDernierNumero(supabase: SupabaseClient, entiteId: string, typeActeId: string, annee: number): Promise<number> {
  const { data, error } = await supabase
    .from("actes")
    .select("numero_ordre")
    .eq("entite_id", entiteId)
    .eq("type_acte_id", typeActeId)
    .eq("annee", annee)
    .order("numero_ordre", { ascending: false })
    .limit(1)
    .maybeSingle<{ numero_ordre: number }>();
  if (error) throw new Error(`Lecture des actes impossible : ${error.message}`);
  return data?.numero_ordre ?? 0;
}

/** Le type d'acte (au catalogue) désigné par son code dans l'adresse, ex. /officier/actes/nouveau/EXNAIS. */
export async function lireTypeParCode(
  supabase: SupabaseClient,
  code: string,
): Promise<(TypeActe & { modele_fiche: ModeleFiche }) | null> {
  if (!/^[A-Z]{2,6}$/.test(code)) return null;
  const { data, error } = await supabase
    .from("types_actes")
    .select("id, numero, code, libelle, famille, modele_fiche, tarif_distinct_etranger, couleur, actif")
    .eq("code", code)
    .eq("actif", true)
    .maybeSingle<TypeActe & { modele_fiche: ModeleFiche }>();
  if (error) throw new Error(`Lecture du catalogue impossible : ${error.message}`);
  return data;
}

