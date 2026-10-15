// Fichier 39 — montant en toutes lettres (orthographe traditionnelle)
import { describe, expect, it } from "vitest";
import { montantEnLettres, nombreEnLettres } from "./montant-en-lettres";

describe("Nombres en lettres", () => {
  it.each([
    [0, "zéro"], [1, "un"], [16, "seize"], [17, "dix-sept"], [20, "vingt"], [21, "vingt et un"], [22, "vingt-deux"],
    [31, "trente et un"], [61, "soixante et un"], [70, "soixante-dix"], [71, "soixante et onze"], [77, "soixante-dix-sept"],
    [80, "quatre-vingts"], [81, "quatre-vingt-un"], [90, "quatre-vingt-dix"], [91, "quatre-vingt-onze"], [99, "quatre-vingt-dix-neuf"],
    [100, "cent"], [101, "cent un"], [180, "cent quatre-vingts"], [200, "deux cents"], [201, "deux cent un"], [999, "neuf cent quatre-vingt-dix-neuf"],
    [1000, "mille"], [1001, "mille un"], [2000, "deux mille"], [8000, "huit mille"], [18000, "dix-huit mille"],
    [21000, "vingt et un mille"], [80000, "quatre-vingt mille"], [85500, "quatre-vingt-cinq mille cinq cents"],
    [86200, "quatre-vingt-six mille deux cents"], [200000, "deux cent mille"], [280000, "deux cent quatre-vingt mille"],
    [1000000, "un million"], [2000000, "deux millions"], [200000000, "deux cents millions"], [80000000, "quatre-vingts millions"],
    [1234567, "un million deux cent trente-quatre mille cinq cent soixante-sept"], [3000000000, "trois milliards"],
  ])("%i → %s", (n, texte) => expect(nombreEnLettres(n)).toBe(texte));
});

describe("Montant du reçu en lettres", () => {
  it("francs congolais (maquette)", () => {
    expect(montantEnLettres(85500, "CDF")).toBe("Quatre-vingt-cinq mille cinq cents francs congolais.");
    expect(montantEnLettres(18000, "CDF")).toBe("Dix-huit mille francs congolais.");
    expect(montantEnLettres(1, "CDF")).toBe("Un franc congolais.");
    expect(montantEnLettres(1000000, "CDF")).toBe("Un million de francs congolais.");
    expect(montantEnLettres(1500000, "CDF")).toBe("Un million cinq cent mille francs congolais.");
  });
  it("dollars, avec ou sans cents", () => {
    expect(montantEnLettres(30, "USD")).toBe("Trente dollars américains.");
    expect(montantEnLettres(1, "USD")).toBe("Un dollar américain.");
    expect(montantEnLettres(12.5, "USD")).toBe("Douze dollars américains et cinquante cents.");
    expect(montantEnLettres(0.01, "USD")).toBe("Zéro dollar américain et un cent.");
  });
});
