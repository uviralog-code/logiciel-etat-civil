/**
 * MENUS DES ESPACES DE TRAVAIL (d'après les maquettes validées)
 *
 * « disponible » passe à vrai au fur et à mesure que les écrans sont construits ;
 * en attendant, l'entrée est affichée en grisé, sans lien.
 */
import type { RoleUtilisateur } from "./charte";

export type NomIcone =
  | "accueil" | "plus" | "scanner" | "recherche" | "registres" | "etiquette"
  | "billets" | "recus" | "taux" | "cadenas" | "graphique"
  | "tableau" | "grille" | "personnes" | "journal" | "connexions";

export interface EntreeMenu {
  libelle: string;
  chemin: string;
  icone: NomIcone;
  disponible: boolean;
}

export const MENUS: Record<RoleUtilisateur, EntreeMenu[]> = {
  officier: [
    { libelle: "Accueil", chemin: "/officier", icone: "accueil", disponible: true },
    { libelle: "Nouvel acte", chemin: "/officier/actes/nouveau", icone: "plus", disponible: true },
    { libelle: "Scanner", chemin: "/officier/scanner", icone: "scanner", disponible: true },
    { libelle: "Rechercher", chemin: "/officier/recherche", icone: "recherche", disponible: true },
    { libelle: "Anciens registres", chemin: "/officier/anciens-registres", icone: "registres", disponible: true },
    { libelle: "Tarifs de l'entité", chemin: "/officier/tarifs", icone: "etiquette", disponible: true },
  ],
  caissier: [
    { libelle: "Accueil", chemin: "/caissier", icone: "accueil", disponible: true },
    { libelle: "Encaisser", chemin: "/caissier/encaisser", icone: "billets", disponible: true },
    { libelle: "Reçus du jour", chemin: "/caissier/recus", icone: "recus", disponible: true },
    { libelle: "Taux du jour", chemin: "/caissier/taux", icone: "taux", disponible: true },
    // Ajout du fichier 25 (absent de la maquette) : les prix de l'entité, en lecture seule
    { libelle: "Tarifs", chemin: "/caissier/tarifs", icone: "etiquette", disponible: true },
    { libelle: "Clôture de caisse", chemin: "/caissier/cloture", icone: "cadenas", disponible: true },
    { libelle: "Rapports", chemin: "/caissier/rapports", icone: "graphique", disponible: false },
    { libelle: "Rechercher", chemin: "/caissier/recherche", icone: "recherche", disponible: true },
  ],
  admin: [
    { libelle: "Tableau de bord", chemin: "/admin", icone: "tableau", disponible: true },
    { libelle: "Rapports consolidés", chemin: "/admin/rapports", icone: "graphique", disponible: false },
    { libelle: "Grille commune", chemin: "/admin/grille", icone: "grille", disponible: true },
    // Ajout du fichier 27 (absent de la maquette) : retirer, remettre, ajouter un type d'acte
    { libelle: "Catalogue des actes", chemin: "/admin/catalogue", icone: "registres", disponible: true },
    { libelle: "Comptes", chemin: "/admin/comptes", icone: "personnes", disponible: true },
    { libelle: "Journal d'audit", chemin: "/admin/journal", icone: "journal", disponible: false },
    { libelle: "Connexions", chemin: "/admin/connexions", icone: "connexions", disponible: false },
    { libelle: "Rechercher", chemin: "/admin/recherche", icone: "recherche", disponible: true },
  ],
};

/** Sous-titre sous « État civil · Uvira » dans le menu. */
export function sousTitreEspace(role: RoleUtilisateur, entite: { nom: string } | null): string {
  if (role === "admin") return "Administration · CDJP/Bukavu";
  const nom = entite?.nom ?? "";
  return role === "caissier" ? `${nom} · Caisse` : nom;
}

/** « Mardi 13 octobre 2026 » (heure de Lubumbashi, comme la base). */
export function dateDuJour(maintenant = new Date()): string {
  const texte = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lubumbashi",
  }).format(maintenant);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
