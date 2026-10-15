// Fichier 38 — encaissement : montant à percevoir, rendu de monnaie, motif d'exonération, appels à la base
import { describe, expect, it } from "vitest";
import {
  aidePrecision,
  composerMotifExoneration,
  encaisserActe,
  exonererActe,
  lireMontant,
  MESSAGES_ENCAISSEMENT,
  monnaieARendre,
  montantAPercevoir,
  MOTIFS_EXONERATION,
  PRECISION_EXONERATION_MAX,
} from "./encaissement";

const n = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const ID = "00000000-0000-0000-0000-000000000001";

describe("Montant à percevoir (mêmes règles que la base)", () => {
  it("acte en dollars payé en francs : conversion, arrondie à la centaine", () => {
    const r = montantAPercevoir({ montant: 30, devise: "USD" }, "CDF", 2850);
    expect(r).toMatchObject({ ok: true, montant: 85500, devise: "CDF" });
    expect(r.ok && n(r.calcul)).toBe("30 $ × 2 850 FC = 85 500 FC");
    const a = montantAPercevoir({ montant: 30, devise: "USD" }, "CDF", 2873);
    expect(a).toMatchObject({ ok: true, montant: 86200 });
    expect(a.ok && n(a.calcul)).toBe("30 $ × 2 873 FC = 86 190 FC, arrondi à 86 200 FC");
  });
  it("acte en dollars payé en dollars ; acte en francs payé en francs : aucune conversion", () => {
    expect(montantAPercevoir({ montant: 30, devise: "USD" }, "USD", 2850)).toEqual({
      ok: true, montant: 30, devise: "USD", calcul: "Payé dans la monnaie de l'acte, aucune conversion.",
    });
    expect(montantAPercevoir({ montant: 18000, devise: "CDF" }, "CDF", null)).toMatchObject({ ok: true, montant: 18000, devise: "CDF" });
  });
  it("acte en francs payé en dollars : refusé ; acte en dollars sans taux : refusé", () => {
    expect(montantAPercevoir({ montant: 18000, devise: "CDF" }, "USD", 2850)).toEqual({ ok: false, message: "Cet acte est au tarif en francs : il se paie en francs congolais." });
    expect(montantAPercevoir({ montant: 30, devise: "USD" }, "USD", null)).toMatchObject({ ok: false, message: expect.stringContaining("taux du jour") });
  });
});

describe("Rendu de monnaie (aide facultative)", () => {
  it("lecture du montant remis", () => {
    expect(lireMontant("100 000")).toBe(100000);
    expect(lireMontant("50,5")).toBe(50.5);
    expect(lireMontant("1 000")).toBe(1000);
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("10,555")).toBeNull();
  });
  it("vide, invalide, manque, compte juste, monnaie à rendre", () => {
    expect(monnaieARendre("  ", 85500, "CDF")).toEqual({ etat: "vide" });
    expect(monnaieARendre("cent", 85500, "CDF")).toMatchObject({ etat: "invalide" });
    expect(n((monnaieARendre("80000", 85500, "CDF") as { texte: string }).texte)).toBe("Il manque 5 500 FC.");
    expect(monnaieARendre("85 500", 85500, "CDF")).toEqual({ etat: "juste", texte: "Compte juste : aucune monnaie à rendre." });
    const r = monnaieARendre("100 000", 85500, "CDF");
    expect(r).toMatchObject({ etat: "rendre", montant: 14500 });
    expect(n((r as { texte: string }).texte)).toBe("Monnaie à rendre : 14 500 FC");
    expect(monnaieARendre("50", 30, "USD")).toMatchObject({ etat: "rendre", montant: 20, texte: "Monnaie à rendre : 20 $" });
    // Sans erreur de virgule
    expect(monnaieARendre("0,3", 0.1 + 0.2, "USD")).toMatchObject({ etat: "juste" });
  });
});

describe("Exonération : motif courant + précision obligatoire", () => {
  it("motif — précision ; « Autre motif » : la précision seule", () => {
    expect(composerMotifExoneration(MOTIFS_EXONERATION[0], "  attestation n° 045/2026  ")).toEqual({
      ok: true, motif: "Indigent (attestation d'indigence) — attestation n° 045/2026",
    });
    expect(composerMotifExoneration("Autre motif", "Victime d'inondation (liste du HCR)")).toEqual({ ok: true, motif: "Victime d'inondation (liste du HCR)" });
  });
  it("précision toujours obligatoire ; motif inconnu ou absent refusé ; trop long refusé", () => {
    expect(composerMotifExoneration(MOTIFS_EXONERATION[1], " ")).toEqual({ ok: false, message: MESSAGES_ENCAISSEMENT.precision, champ: "precision" });
    expect(composerMotifExoneration("", "x y z")).toMatchObject({ ok: false, champ: "motif" });
    expect(composerMotifExoneration("Ami du caissier", "x y z")).toMatchObject({ ok: false, champ: "motif" });
    expect(composerMotifExoneration(MOTIFS_EXONERATION[2], "x".repeat(PRECISION_EXONERATION_MAX + 1))).toMatchObject({ ok: false, champ: "precision" });
  });
  it("aide à la précision selon le motif", () => {
    expect(aidePrecision(MOTIFS_EXONERATION[0])).toContain("attestation n°");
    expect(aidePrecision("")).toBe("Écrivez le motif de l'exonération");
  });
});

describe("Appels à la base", () => {
  const base = (resultat: { data: unknown; error: { code?: string; message: string } | null }, appels: unknown[] = []) =>
    ({
      rpc: (nom: string, p: unknown) => {
        appels.push([nom, p]);
        return Object.assign(Promise.resolve(resultat), { single: async () => resultat });
      },
    }) as never;

  it("encaisser : montant annoncé transmis ; numéro du reçu rendu", async () => {
    const appels: unknown[] = [];
    expect(await encaisserActe(base({ data: { id: "r1", numero_recu: "MUL-REC-2026-000001" }, error: null }, appels), ID, "CDF", 85500)).toEqual({
      ok: true, recu: { id: "r1", numero: "MUL-REC-2026-000001" },
    });
    expect(appels).toEqual([["encaisser_verifie", { p_acte: ID, p_devise_recue: "CDF", p_montant_annonce: 85500 }]]);
  });
  it("encaisser : contrôles avant la base ; messages de la base", async () => {
    const jamais = { rpc: () => { throw new Error("ne doit pas être appelée"); } } as never;
    expect(await encaisserActe(jamais, "x", "CDF", 1)).toEqual({ ok: false, message: MESSAGES_ENCAISSEMENT.introuvable });
    expect(await encaisserActe(jamais, ID, "EUR", 1)).toMatchObject({ ok: false, champ: "devise" });
    expect(await encaisserActe(jamais, ID, "CDF", Number.NaN)).toMatchObject({ ok: false });
    expect(await encaisserActe(base({ data: null, error: { code: "P0001", message: "Le montant à percevoir a changé…" } }), ID, "CDF", 85500)).toEqual({
      ok: false, message: "Le montant à percevoir a changé…",
    });
    expect(await encaisserActe(base({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }), ID, "CDF", 1)).toEqual({
      ok: false, message: MESSAGES_ENCAISSEMENT.refus,
    });
  });
  it("exonérer : motif composé envoyé à la base", async () => {
    const appels: unknown[] = [];
    expect(await exonererActe(base({ data: {}, error: null }, appels), ID, MOTIFS_EXONERATION[1], "décision n° 12/2026")).toEqual({ ok: true });
    expect(appels).toEqual([["exonerer", { p_acte: ID, p_motif: "Décision de l'autorité locale — décision n° 12/2026" }]]);
    expect(await exonererActe(base({ data: {}, error: null }), ID, MOTIFS_EXONERATION[1], "")).toMatchObject({ ok: false, champ: "precision" });
  });
});
