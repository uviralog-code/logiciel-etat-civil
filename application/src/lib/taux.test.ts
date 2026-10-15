// Fichier 26 — taux du jour : lecture, garde-fous, état du jour
import { describe, expect, it } from "vitest";
import {
  demandeConfirmation,
  ecartAvec,
  etatTauxDuJour,
  exempleConversion,
  formaterEcart,
  heureUvira,
  lireTaux,
  MESSAGES_TAUX,
} from "./taux";

const n = (s: string) => s.replace(/[  ]/g, " ");

describe("Taux tapé", () => {
  it.each([
    ["2850", 2850],
    ["2 850", 2850],
    ["2 850", 2850],
    ["2850 FC", 2850],
    ["2850,5", 2850.5],
    ["500", 500],
    ["20000", 20000],
  ] as const)("« %s » → %s", (texte, attendu) => expect(lireTaux(texte)).toBe(attendu));

  it.each(["", "deux mille", "-2850", "2850 $"])("« %s » → refusé", (texte) => expect(lireTaux(texte)).toBe(MESSAGES_TAUX.vide));

  it("trop de décimales", () => expect(lireTaux("2850,125")).toBe(MESSAGES_TAUX.decimales));

  it("garde-fou 500 – 20 000 : un chiffre en trop ou en moins est signalé", () => {
    expect(n(String(lireTaux("285")))).toBe(
      "Taux invraisemblable : 285 FC pour 1 $. Il doit être compris entre 500 et 20 000 FC. Vérifiez qu'il ne manque pas un chiffre, ou qu'il n'y en a pas un de trop.",
    );
    expect(n(String(lireTaux("28500")))).toContain("28 500 FC pour 1 $");
  });
});

describe("Écart avec le taux précédent", () => {
  it("calcul et affichage", () => {
    expect(ecartAvec(3400, 2850)).toBeCloseTo(0.193, 3);
    expect(ecartAvec(2850, null)).toBeNull();
    expect(formaterEcart(0.193)).toBe("+19,3 %");
    expect(formaterEcart(-0.035)).toBe("−3,5 %");
  });

  it("confirmation au-delà de 10 % seulement (dans les deux sens)", () => {
    expect(demandeConfirmation(3135, 2850)).toBe(false); // +10 % pile
    expect(demandeConfirmation(3136, 2850)).toBe(true);
    expect(demandeConfirmation(2500, 2850)).toBe(true);
    expect(demandeConfirmation(2900, 2850)).toBe(false);
    expect(demandeConfirmation(2900, null)).toBe(false); // premier taux de l'entité
  });
});

describe("État du taux pour aujourd'hui (heure d'Uvira)", () => {
  const maintenant = new Date("2026-10-14T09:00:00Z"); // 11 h 00 à Uvira

  it("saisi ce matin : « saisi à 07 h 58 »", () => {
    expect(etatTauxDuJour({ taux: 2850, en_vigueur_depuis: "2026-10-14T05:58:00Z" }, maintenant)).toEqual({ type: "du-jour", taux: 2850, heure: "07 h 58" });
  });

  it("saisi hier soir à 23 h 30 (21 h 30 UTC) : c'est le taux d'hier", () => {
    expect(etatTauxDuJour({ taux: 2800, en_vigueur_depuis: "2026-10-13T21:30:00Z" }, maintenant)).toEqual({ type: "ancien", taux: 2800, date: "13/10/2026" });
  });

  it("saisi à 00 h 30 à Uvira (22 h 30 UTC la veille) : c'est bien celui du jour", () => {
    expect(etatTauxDuJour({ taux: 2860, en_vigueur_depuis: "2026-10-13T22:30:00Z" }, maintenant)).toMatchObject({ type: "du-jour", heure: "00 h 30" });
  });

  it("jamais saisi", () => expect(etatTauxDuJour(null, maintenant)).toEqual({ type: "aucun" }));

  it("heure et exemple de conversion", () => {
    expect(heureUvira("2026-10-14T05:58:00Z")).toBe("07 h 58");
    expect(n(exempleConversion(2850))).toBe("10 $ = 28 500 FC");
  });
});
