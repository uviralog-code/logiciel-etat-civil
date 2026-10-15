// Fichier 32 — recherche : critères dans l'adresse, ID sans code d'entité, lien de retour sûr
import { describe, expect, it } from "vitest";
import { retourDepuisAdresse } from "@/components/lien-retour";
import { adresseRecherche, anneesProposees, completerId, criteresDepuisAdresse } from "./recherche";

const TYPE = "6cb277d3-813d-405f-8614-9f95b4de8af2";

describe("Critères lus dans l'adresse", () => {
  it("valeurs correctes gardées, valeurs invalides ignorées", () => {
    expect(criteresDepuisAdresse({ q: "Mugisho", type: TYPE, annee: "2026", statut: "paye" })).toEqual({
      texte: "Mugisho", typeActeId: TYPE, annee: 2026, statut: "paye",
    });
    expect(criteresDepuisAdresse({ q: ["a", "b"], type: "x' or 1=1", annee: "abc", statut: "inconnu" })).toEqual({
      texte: "a", typeActeId: null, annee: null, statut: null,
    });
    expect(criteresDepuisAdresse({})).toEqual({ texte: "", typeActeId: null, annee: null, statut: null });
    expect(criteresDepuisAdresse({ q: "x".repeat(500) }).texte).toHaveLength(120);
  });

  it("et réécrits pour revenir aux mêmes résultats", () => {
    expect(adresseRecherche("/officier/recherche", { texte: "Mugisho Bahati", typeActeId: null, annee: 2026, statut: null })).toBe(
      "/officier/recherche?q=Mugisho+Bahati&annee=2026",
    );
    expect(adresseRecherche("/officier/recherche", { texte: "", typeActeId: null, annee: null, statut: null })).toBe("/officier/recherche");
  });
});

describe("ID tapé sans le code de l'entité", () => {
  it.each([
    ["EXNAIS-2026-123", "MUL", "MUL-EXNAIS-2026-123"],
    ["exnais-2026-", "MUL", "MUL-EXNAIS-2026-"],
    [" exnais - 2026 - 123 ", "KAV", "KAV-EXNAIS-2026-123"],
    ["MUL-EXNAIS-2026-123", "MUL", "MUL-EXNAIS-2026-123"],
    ["Mugisho Bahati", "MUL", "Mugisho Bahati"],
    ["EXNAIS-2026-123", null, "EXNAIS-2026-123"],
  ] as const)("« %s » (%s) → « %s »", (texte, entite, attendu) => expect(completerId(texte, entite)).toBe(attendu));
});

describe("Lien « ‹ Résultats de la recherche » : seulement vers la recherche de l'espace", () => {
  it.each([
    ["/officier/recherche?q=Mugisho", "/officier/recherche?q=Mugisho"],
    ["/officier/recherche", "/officier/recherche"],
    ["https://site-pirate.example/officier/recherche", null],
    ["//site-pirate.example", null],
    ["/admin/comptes", null],
    ["/officier/recherche-piege", null],
    [undefined, null],
  ] as const)("%s → %s", (retour, attendu) => expect(retourDepuisAdresse({ retour }, "/officier/recherche")).toBe(attendu));
});

it("années du filtre : de l'année en cours à 1960 (anciens registres)", () => {
  const a = anneesProposees(2026);
  expect([a[0], a.at(-1), a.length]).toEqual([2026, 1960, 67]);
});
