/**
 * RECHERCHE D'UN ACTE (fichier 32)
 *
 * Une seule barre, par ID ou par nom ; le travail est fait par la base
 * (fonction rechercher_actes, fichier 09) : zéros du numéro facultatifs,
 * début d'ID pour toute une série, noms dans n'importe quel ordre, sans
 * accents, fautes de frappe tolérées, n° d'ancien registre reconnu.
 * Filtres : type d'acte, année, statut. Chacun ne trouve que ce que la base
 * lui laisse voir : son entité (officier, caissier) ou les 4 (administrateur).
 *
 * La recherche vit dans l'adresse (?q=…&type=…&annee=…&statut=…) : le bouton
 * « Retour » du navigateur et le lien « ‹ Résultats de la recherche » de la
 * fiche ramènent aux mêmes résultats.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUTS, type StatutActe } from "./charte";

export interface CriteresRecherche {
  texte: string;
  typeActeId: string | null;
  annee: number | null;
  statut: StatutActe | null;
}

export interface ResultatRecherche {
  acteId: string;
  identifiant: string;
  entiteCode: string;
  typeCode: string;
  typeLibelle: string;
  titulaire: string;
  titulaire2: string | null;
  demandeur: string | null;
  numeroRegistre: string | null;
  dateActe: string;
  statut: StatutActe;
  scanne: boolean;
  correspondance: "id_exact" | "id_debut" | "nom";
}

export const LIMITE_RESULTATS = 50;

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Lit les critères dans l'adresse ; toute valeur invalide est ignorée. */
export function criteresDepuisAdresse(p: Record<string, string | string[] | undefined>): CriteresRecherche {
  const type = premier(p.type);
  const annee = Number(premier(p.annee));
  const statut = premier(p.statut);
  return {
    texte: premier(p.q).slice(0, 120),
    typeActeId: /^[0-9a-f-]{36}$/i.test(type) ? type : null,
    annee: Number.isInteger(annee) && annee >= 1900 && annee <= 2100 ? annee : null,
    statut: statut in STATUTS ? (statut as StatutActe) : null,
  };
}

/** L'adresse d'une recherche (pour le lien « ‹ Résultats de la recherche »). */
export function adresseRecherche(base: string, c: CriteresRecherche): string {
  const p = new URLSearchParams();
  if (c.texte) p.set("q", c.texte);
  if (c.typeActeId) p.set("type", c.typeActeId);
  if (c.annee) p.set("annee", String(c.annee));
  if (c.statut) p.set("statut", c.statut);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

/**
 * Un agent tape souvent l'ID sans le code de son entité : « EXNAIS-2026-123 ».
 * On le complète avec le code de l'entité (MUL-EXNAIS-2026-123). L'administrateur,
 * lui, cherche dans les 4 entités : il tape l'ID complet.
 */
export function completerId(texte: string, codeEntite: string | null): string {
  const t = texte.trim().toUpperCase().replace(/\s+/g, "");
  if (codeEntite && /^[A-Z]{2,6}-\d{4}(-\d{0,6})?$/.test(t)) return `${codeEntite}-${t}`;
  return texte.trim();
}

export type ReponseRecherche =
  | { etat: "vide" }
  | { etat: "trouve"; resultats: ResultatRecherche[]; tronque: boolean }
  | { etat: "erreur"; message: string };

type Ligne = {
  acte_id: string; identifiant: string; entite_code: string; type_code: string; type_libelle: string; titulaire_nom: string;
  titulaire_2_nom: string | null; demandeur_nom: string | null; numero_registre: string | null; date_acte: string;
  statut: StatutActe; a_un_scan: boolean; correspondance: ResultatRecherche["correspondance"];
};

/** Lance la recherche (avec les droits de la personne connectée). */
export async function rechercherActes(supabase: SupabaseClient, c: CriteresRecherche, codeEntite: string | null): Promise<ReponseRecherche> {
  const texte = completerId(c.texte, codeEntite);
  if (!texte) return { etat: "vide" };
  if (texte.replace(/\s/g, "").length < 2) return { etat: "erreur", message: "Tapez au moins 2 caractères pour lancer une recherche." };

  const { data, error } = await supabase.rpc("rechercher_actes", {
    p_texte: texte,
    p_type_acte: c.typeActeId,
    p_annee: c.annee,
    p_statut: c.statut,
    p_limite: LIMITE_RESULTATS + 1,
  });
  if (error) {
    if (error.code === "P0001") return { etat: "erreur", message: error.message };
    throw new Error(`Recherche impossible : ${error.message}`);
  }
  const lignes = (data ?? []) as Ligne[];
  return {
    etat: "trouve",
    tronque: lignes.length > LIMITE_RESULTATS,
    resultats: lignes.slice(0, LIMITE_RESULTATS).map((l) => ({
      acteId: l.acte_id, identifiant: l.identifiant, entiteCode: l.entite_code, typeCode: l.type_code, typeLibelle: l.type_libelle,
      titulaire: l.titulaire_nom, titulaire2: l.titulaire_2_nom, demandeur: l.demandeur_nom, numeroRegistre: l.numero_registre,
      dateActe: l.date_acte, statut: l.statut, scanne: l.a_un_scan, correspondance: l.correspondance,
    })),
  };
}

/** Les années proposées dans le filtre : de l'année en cours jusqu'à 1960 (anciens registres). */
export function anneesProposees(anneeEnCours: number): number[] {
  return Array.from({ length: anneeEnCours - 1960 + 1 }, (_, i) => anneeEnCours - i);
}
