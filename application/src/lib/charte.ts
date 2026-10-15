/**
 * CHARTE GRAPHIQUE ET LIBELLÉS — Logiciel d'état civil (CDJP/Bukavu)
 *
 * Couleurs et libellés repris des maquettes validées (étape 3).
 * Les types ci-dessous reproduisent les listes de valeurs de la base
 * (fichier 01 « fondations ») : un test vérifie qu'ils restent identiques.
 */

// ---------------------------------------------------------------------
// Listes de valeurs de la base
// ---------------------------------------------------------------------
export type RoleUtilisateur = "admin" | "officier" | "caissier";

export type StatutActe =
  | "enregistre"
  | "en_attente_paiement"
  | "paye"
  | "exonere"
  | "delivre"
  | "annule";

export type FamilleActe =
  | "acte_etat_civil"
  | "attestation"
  | "certificat"
  | "autorisation"
  | "extrait";

export type Devise = "USD" | "CDF";

// ---------------------------------------------------------------------
// Couleurs de l'institution
// ---------------------------------------------------------------------
export const COULEURS = {
  bleuEtat: "#0B3D91", // couleur principale (menus, boutons)
  bleuEtatFonce: "#072A66",
  encre: "#14213D", // texte principal
  texteDoux: "#4A5568", // texte secondaire
  fond: "#F4F6F9",
  surface: "#FFFFFF",
  bordure: "#D9DFE8",
  bordureChamp: "#A9B4C4",
  // Liseré aux couleurs du drapeau de la RDC
  drapeauCiel: "#0B7BD8",
  drapeauJaune: "#F7D618",
  drapeauRouge: "#C8102E",
  // Messages
  succesFond: "#E8F5EC",
  succesTexte: "#1B5E20",
  attentionFond: "#FFF4D6",
  attentionTexte: "#6B4E00",
  erreurFond: "#FDECEC",
  erreurTexte: "#8A1C1C",
} as const;

// ---------------------------------------------------------------------
// Familles d'actes (la couleur exacte de chaque acte vient de la base)
// ---------------------------------------------------------------------
export const FAMILLES: Record<FamilleActe, { libelle: string; couleur: string }> = {
  acte_etat_civil: { libelle: "Actes d'état civil", couleur: "#0B3D91" },
  extrait: { libelle: "Extraits", couleur: "#374151" },
  attestation: { libelle: "Attestations", couleur: "#1565C0" },
  certificat: { libelle: "Certificats", couleur: "#00727C" },
  autorisation: { libelle: "Autorisations et permis", couleur: "#BF360C" },
};

// ---------------------------------------------------------------------
// Statuts d'un acte : libellé et pastille
// ---------------------------------------------------------------------
export const STATUTS: Record<StatutActe, { libelle: string; fond: string; texte: string }> = {
  enregistre: { libelle: "Enregistré", fond: "#EEF0F3", texte: "#374151" },
  en_attente_paiement: { libelle: "En attente de paiement", fond: "#FFF4D6", texte: "#6B4E00" },
  paye: { libelle: "Payé", fond: "#E6EDF8", texte: "#0B3D91" },
  exonere: { libelle: "Exonéré", fond: "#E0F2F1", texte: "#00594F" },
  delivre: { libelle: "Délivré", fond: "#E8F5EC", texte: "#1B5E20" },
  annule: { libelle: "Annulé", fond: "#FDECEC", texte: "#8A1C1C" },
};

export const ROLES: Record<RoleUtilisateur, string> = {
  admin: "Administrateur principal",
  officier: "Officier d'état civil",
  caissier: "Caissier",
};

// ---------------------------------------------------------------------
// Contraste (norme WCAG) : un texte doit atteindre 4,5 contre son fond
// ---------------------------------------------------------------------
function luminance(hex: string): number {
  const valeur = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(valeur)) {
    throw new Error(`Couleur invalide : ${hex}`);
  }
  const canaux = [0, 2, 4].map((i) => parseInt(valeur.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs (de 1 à 21). */
export function contraste(couleur1: string, couleur2: string): number {
  const [clair, sombre] = [luminance(couleur1), luminance(couleur2)].sort((a, b) => b - a);
  return (clair + 0.05) / (sombre + 0.05);
}

/** Seuil minimal pour un texte courant. */
export const CONTRASTE_MINIMUM = 4.5;
