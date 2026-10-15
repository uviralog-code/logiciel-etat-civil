// Fichier 40 — reçus du jour : qui peut être annulé, contrôle du motif, messages
import { describe, expect, it } from "vitest";
import { annulerRecu, MESSAGES_ANNULATION, messageAnnulation, obstacleAnnulation, peutRevenirEnFile } from "./recus-du-jour";

const ID = "00000000-0000-0000-0000-000000000001";

describe("Annulation d'un reçu", () => {
  it("seulement un reçu valide, avant la clôture", () => {
    expect(obstacleAnnulation({ statut: "valide" }, null)).toBeNull();
    expect(obstacleAnnulation({ statut: "annule" }, null)).toBe("Ce reçu est déjà annulé.");
    expect(obstacleAnnulation({ statut: "valide" }, "2026-10-15T15:00:00Z")).toContain("clôturée");
  });
  it("seul un acte payé (pas encore délivré) revient dans la file", () => {
    expect(peutRevenirEnFile("paye")).toBe(true);
    expect(peutRevenirEnFile("delivre")).toBe(false);
    expect(peutRevenirEnFile("annule")).toBe(false);
  });
  it("contrôles avant la base : reçu, choix, motif", async () => {
    const jamais = { rpc: () => { throw new Error("ne doit pas être appelée"); } } as never;
    expect(await annulerRecu(jamais, "x", "motif", "remettre")).toEqual({ ok: false, message: MESSAGES_ANNULATION.introuvable });
    expect(await annulerRecu(jamais, ID, "Mauvaise monnaie", "")).toEqual({ ok: false, message: MESSAGES_ANNULATION.suite, champ: "suite" });
    expect(await annulerRecu(jamais, ID, " a ", "remettre")).toEqual({ ok: false, message: MESSAGES_ANNULATION.motif, champ: "motif" });
    expect(await annulerRecu(jamais, ID, "x".repeat(301), "remettre")).toMatchObject({ ok: false, champ: "motif" });
  });
  it("envoi à la base : motif nettoyé, choix traduit ; messages de la base", async () => {
    const appels: unknown[] = [];
    const base = (resultat: { data: unknown; error: { code?: string; message: string } | null }) =>
      ({ rpc: (nom: string, p: unknown) => { appels.push([nom, p]); return { select: () => ({ single: async () => resultat }) }; } }) as never;
    const ok = await annulerRecu(base({ data: { numero_recu: "MUL-REC-2026-000001", acte: { identifiant: "MUL-ATRES-2026-000001" } }, error: null }), ID, "  Mauvaise   monnaie ", "remettre");
    expect(ok).toEqual({ ok: true, numero: "MUL-REC-2026-000001", remis: true, acte: "MUL-ATRES-2026-000001" });
    expect(appels).toEqual([["annuler_recu", { p_recu: ID, p_motif: "Mauvaise monnaie", p_remettre_en_file: true }]]);
    expect(await annulerRecu(base({ data: null, error: { code: "P0001", message: "La caisse du 15/10/2026 est clôturée : ce reçu ne peut plus être annulé." } }), ID, "Trop tard", "annuler-acte"))
      .toEqual({ ok: false, message: "La caisse du 15/10/2026 est clôturée : ce reçu ne peut plus être annulé." });
  });
  it("message après l'annulation", () => {
    expect(messageAnnulation({ ok: true, numero: "MUL-REC-2026-000001", remis: true, acte: "MUL-ATRES-2026-000001" }))
      .toBe("Reçu MUL-REC-2026-000001 annulé. L'acte MUL-ATRES-2026-000001 est revenu dans la file « À encaisser ».");
    expect(messageAnnulation({ ok: true, numero: "MUL-REC-2026-000001", remis: false, acte: "MUL-ATRES-2026-000001" }))
      .toBe("Reçu MUL-REC-2026-000001 annulé, ainsi que l'acte MUL-ATRES-2026-000001 : l'Officier devra en enregistrer un nouveau.");
  });
});
