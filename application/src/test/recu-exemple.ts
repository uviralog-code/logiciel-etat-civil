// Reçu d'exemple pour les tests (fichier 39), d'après la maquette « Caissier — Reçu »
import type { RecuDetaille } from "@/lib/recus";

export const RECU: RecuDetaille = {
  id: "00000000-0000-0000-0000-000000000001",
  numero: "MUL-REC-2026-000845",
  statut: "valide",
  motifAnnulation: null,
  encaisseLe: "2026-10-13T06:29:00Z",
  journee: "2026-10-13",
  montantDu: 30,
  deviseDu: "USD",
  montantRecu: 85500,
  deviseRecue: "CDF",
  tauxApplique: 2850,
  equivalentCdf: 85500,
  caissier: "Neema Furaha",
  jeton: "0123456789abcdef0123456789abcdef",
  entite: { nom: "Commune de Mulongwe", type: "commune", ville: "Uvira", province: "Sud-Kivu" },
  impressions: 0,
  acte: { id: "a", identifiant: "MUL-EXNAIS-2026-000124", titulaire: "Mapendo Grace", demandeur: "Mapendo Joseph", categorie: "national", typeLibelle: "Extrait d'acte de naissance" },
};
