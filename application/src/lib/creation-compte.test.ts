// Fichier 21 — mot de passe provisoire et nom d'utilisateur proposé
import { describe, expect, it } from "vitest";
import { genererMotDePasseProvisoire, nomUtilisateurPropose } from "./creation-compte";
import { LONGUEUR_MINIMALE } from "./mot-de-passe";

describe("Mot de passe provisoire", () => {
  const tirages = Array.from({ length: 2000 }, () => genererMotDePasseProvisoire());

  it("format « 7K4-PX9-QM2 » : 3 groupes de 3, sans caractères ambigus (0, O, 1, I, L)", () => {
    for (const m of tirages) expect(m).toMatch(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
  });
  it(`assez long pour la règle des ${LONGUEUR_MINIMALE} caractères`, () => {
    expect(tirages[0].length).toBeGreaterThanOrEqual(LONGUEUR_MINIMALE);
  });
  it("jamais deux fois le même sur 2 000 tirages", () => {
    expect(new Set(tirages).size).toBe(tirages.length);
  });
  it("tous les caractères autorisés sortent, à peu près aussi souvent les uns que les autres", () => {
    const compte = new Map<string, number>();
    for (const c of tirages.join("").replace(/-/g, "")) compte.set(c, (compte.get(c) ?? 0) + 1);
    expect(compte.size).toBe(31);
    const attendu = (tirages.length * 9) / 31; // ≈ 580
    for (const n of compte.values()) expect(Math.abs(n - attendu) / attendu).toBeLessThan(0.25);
  });
});

describe("Nom d'utilisateur proposé", () => {
  it.each([
    ["Commune de Mulongwe", "officier", "mulongwe.officier"],
    ["Commune de Kavimvira", "caissier", "kavimvira.caissier"],
    ["Chefferie des Bavira", "caissier", "bavira.caissier"],
    ["Commune d'Été-Kivu", "officier", "etekivu.officier"],
  ] as const)("%s + %s → %s", (entite, role, attendu) => expect(nomUtilisateurPropose(entite, role)).toBe(attendu));
});
