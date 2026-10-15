// Fichier 41 — clôture de caisse : aide au comptage, écarts, contrôles
import { describe, expect, it } from "vitest";
import { BILLETS, cloturerJournee, ecart, lireCompte, MESSAGES_CLOTURE, totalBillets, validerCloture } from "./cloture";

const n = (s: string) => s.replace(/[  ]/g, " ");

describe("Aide au comptage", () => {
  it("billets en circulation, du plus grand au plus petit", () => {
    expect(BILLETS.CDF).toEqual([20000, 10000, 5000, 1000, 500, 200, 100, 50]);
    expect(BILLETS.USD).toEqual([100, 50, 20, 10, 5, 2, 1]);
  });
  it("total (exemple de la maquette) ; cases vides ignorées ; saisie invalide", () => {
    expect(totalBillets({ 20000: "8", 10000: "4", 5000: "3", 1000: "3", 500: "1" }, "CDF")).toBe(218500);
    expect(totalBillets({ 20: "2", 10: "1", 5: "2" }, "USD")).toBe(60);
    expect(totalBillets({}, "USD")).toBe(0);
    expect(totalBillets({ 20: "2,5" }, "USD")).toBeNull();
    expect(totalBillets({ 20: "-1" }, "USD")).toBeNull();
  });
  it("montant compté : francs sans centimes, dollars avec", () => {
    expect(lireCompte("218 500", "CDF")).toBe(218500);
    expect(lireCompte("218 500", "CDF")).toBe(218500);
    expect(lireCompte("12,5", "CDF")).toBeNull();
    expect(lireCompte("60,50", "USD")).toBe(60.5);
    expect(lireCompte("", "USD")).toBeNull();
  });
});

describe("Écart", () => {
  it("manque, juste, excédent (textes de la maquette)", () => {
    expect(n(ecart(218500, 223500, "CDF").texte)).toBe("− 5 000 FC · manque");
    expect(ecart(60, 60, "USD")).toEqual({ montant: 0, etat: "juste", texte: "0 $ · juste" });
    expect(n(ecart(62, 60, "USD").texte)).toBe("+ 2 $ · excédent");
  });
});

describe("Contrôles avant la clôture", () => {
  const base = { compteUsd: "60", compteCdf: "223 500", explication: "", attenduUsd: 60, attenduCdf: 223500 };
  it("sans écart : pas d'explication demandée", () => {
    expect(validerCloture(base)).toEqual({ ok: true, usd: 60, cdf: 223500, explication: null });
  });
  it("écart : explication obligatoire (5 caractères au moins)", () => {
    expect(validerCloture({ ...base, compteCdf: "218500" })).toMatchObject({ ok: false, champ: "explication" });
    expect(validerCloture({ ...base, compteCdf: "218500", explication: "  Billet   rendu par erreur " })).toEqual({
      ok: true, usd: 60, cdf: 218500, explication: "Billet rendu par erreur",
    });
  });
  it("montants manquants ou invalides", () => {
    expect(validerCloture({ ...base, compteUsd: "" })).toEqual({ ok: false, message: MESSAGES_CLOTURE.usd, champ: "usd" });
    expect(validerCloture({ ...base, compteCdf: "abc" })).toEqual({ ok: false, message: MESSAGES_CLOTURE.cdf, champ: "cdf" });
  });
  it("montants attendus changés pendant le comptage : rien n'est clôturé", async () => {
    const appels: string[] = [];
    const supabase = {
      rpc: async (nom: string) => {
        appels.push(nom);
        return nom === "rapport_synthese" ? { data: [{ recettes_usd: 60, recettes_cdf: 241500 }], error: null } : { data: null, error: null };
      },
    } as never;
    expect(await cloturerJournee(supabase, "e", "2026-10-15", base)).toEqual({ ok: false, message: MESSAGES_CLOTURE.attenduChange });
    expect(appels).toEqual(["rapport_synthese"]);
  });
  it("journée déjà clôturée (autre poste) : message clair", async () => {
    const supabase = {
      rpc: async (nom: string) =>
        nom === "rapport_synthese" ? { data: [{ recettes_usd: 60, recettes_cdf: 223500 }], error: null } : { data: null, error: { code: "23505", message: "duplicate key" } },
    } as never;
    expect(await cloturerJournee(supabase, "e", "2026-10-15", base)).toEqual({ ok: false, message: MESSAGES_CLOTURE.dejaCloturee });
  });
});
