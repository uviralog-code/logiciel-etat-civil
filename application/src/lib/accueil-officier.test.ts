// Fichier 30 — accueil de l'officier : libellés
import { expect, it } from "vitest";
import { libelleStatut, prenomAffiche } from "./accueil-officier";

it("statut, avec « et scanné » quand le scan est fait (comme la maquette)", () => {
  expect(libelleStatut("delivre", true)).toBe("Délivré et scanné");
  expect(libelleStatut("paye", false)).toBe("Payé");
  expect(libelleStatut("en_attente_paiement", false)).toBe("En attente de paiement");
  expect(libelleStatut("annule", true)).toBe("Annulé");
});

it("« Bonjour Bahati » : le premier nom", () => {
  expect(prenomAffiche("Bahati Mugisho")).toBe("Bahati");
  expect(prenomAffiche("  Neema   Furaha ")).toBe("Neema");
});
