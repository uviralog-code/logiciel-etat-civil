// Tableau de bord de l'administrateur : petites aides d'affichage
import { describe, expect, it } from "vitest";
import { deMois, nomCourt, pourcentage, texteEcart, veille } from "./tableau-admin";

const n = (s: string) => s.replace(/[  ]/g, " ");

describe("Aides du tableau de bord", () => {
  it("veille, y compris en début de mois et d'année", () => {
    expect(veille("2026-10-15")).toBe("2026-10-14");
    expect(veille("2026-10-01")).toBe("2026-09-30");
    expect(veille("2027-01-01")).toBe("2026-12-31");
  });
  it("noms courts des entités", () => {
    expect(nomCourt("Commune de Mulongwe")).toBe("Mulongwe");
    expect(nomCourt("Chefferie des Bavira")).toBe("Bavira");
  });
  it("« d'octobre », « de septembre »", () => {
    expect(deMois("octobre")).toBe("d'octobre");
    expect(deMois("août")).toBe("d'août");
    expect(deMois("septembre")).toBe("de septembre");
  });
  it("pourcentage et écarts", () => {
    expect(n(pourcentage(93.5))).toBe("93,5 %");
    expect(pourcentage(null)).toBe("—");
    expect(texteEcart(0, 0)).toBe("0");
    expect(n(texteEcart(0, -5000))).toBe("− 5 000 FC");
    expect(n(texteEcart(2, 1000))).toBe("+ 2 $ ; + 1 000 FC");
  });
});
