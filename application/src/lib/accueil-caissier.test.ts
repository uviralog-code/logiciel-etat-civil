// Fichier 37 — accueil du caissier : motif du renvoi, textes, obstacles à l'encaissement
import { describe, expect, it } from "vitest";
import {
  AUTRE_MOTIF,
  composerMotifRenvoi,
  etatJournee,
  MESSAGES_RENVOI,
  MOTIFS_RENVOI,
  momentTransmission,
  obstacleEncaissement,
  PRECISION_MAX,
  renvoyerActe,
  texteAnnules,
  texteFile,
} from "./accueil-caissier";

const n = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("Motif du renvoi : motif courant + précision", () => {
  it("liste des motifs courants ; « Autre motif » en dernier", () => {
    expect(MOTIFS_RENVOI).toHaveLength(6);
    expect(MOTIFS_RENVOI.at(-1)).toBe(AUTRE_MOTIF);
  });
  it("motif seul, ou motif — précision (espaces nettoyés)", () => {
    expect(composerMotifRenvoi("Nom mal orthographié", "  ")).toEqual({ ok: true, motif: "Nom mal orthographié" });
    expect(composerMotifRenvoi("Nom mal orthographié", "  « Mapendo »   s'écrit avec un seul p ")).toEqual({
      ok: true,
      motif: "Nom mal orthographié — « Mapendo » s'écrit avec un seul p",
    });
  });
  it("« Autre motif » : la précision devient le motif, et elle est obligatoire", () => {
    expect(composerMotifRenvoi(AUTRE_MOTIF, "Carte d'électeur absente")).toEqual({ ok: true, motif: "Carte d'électeur absente" });
    expect(composerMotifRenvoi(AUTRE_MOTIF, " a ")).toEqual({ ok: false, message: MESSAGES_RENVOI.precisionAutre, champ: "precision" });
  });
  it("motif absent ou inventé : refusé ; précision trop longue : refusée", () => {
    expect(composerMotifRenvoi("", "x")).toMatchObject({ ok: false, champ: "motif" });
    expect(composerMotifRenvoi("N'importe quoi", "")).toMatchObject({ ok: false, champ: "motif" });
    expect(composerMotifRenvoi("Erreur de date", "x".repeat(PRECISION_MAX + 1))).toMatchObject({ ok: false, champ: "precision" });
    // Le motif complet reste sous la limite de 300 caractères des motifs
    const r = composerMotifRenvoi("Mauvaise catégorie (national / étranger)", "x".repeat(PRECISION_MAX));
    expect(r.ok && r.motif.length).toBeLessThanOrEqual(300);
  });
  it("aucun appel à la base si le motif est refusé ou l'acte invalide", async () => {
    const base = { rpc: () => { throw new Error("ne doit pas être appelée"); } } as never;
    expect(await renvoyerActe(base, "pas-un-id", "Erreur de date", "")).toEqual({ ok: false, message: MESSAGES_RENVOI.introuvable });
    expect(await renvoyerActe(base, "00000000-0000-0000-0000-000000000001", "", "")).toMatchObject({ ok: false, champ: "motif" });
  });
  it("messages de la base : acte déjà parti de la file → message clair", async () => {
    const base = (erreur: { code: string; message: string }) =>
      ({ rpc: () => ({ single: async () => ({ data: null, error: erreur }) }) }) as never;
    const id = "00000000-0000-0000-0000-000000000001";
    expect(await renvoyerActe(base({ code: "P0001", message: "Le Caissier ne peut que renvoyer à l'Officier un acte en attente de paiement." }), id, "Erreur de date", "")).toEqual({
      ok: false,
      message: MESSAGES_RENVOI.plusEnAttente,
    });
    expect(await renvoyerActe(base({ code: "P0001", message: "Acte introuvable." }), id, "Erreur de date", "")).toEqual({ ok: false, message: "Acte introuvable." });
    expect(await renvoyerActe(base({ code: "42501", message: "x" }), id, "Erreur de date", "")).toEqual({ ok: false, message: MESSAGES_RENVOI.refus });
  });
});

describe("Textes de l'accueil", () => {
  it("heure de transmission : aujourd'hui l'heure seule, sinon la date aussi (heure d'Uvira)", () => {
    expect(n(momentTransmission("2026-10-14T06:15:00Z", "2026-10-14"))).toBe("08 h 15");
    expect(n(momentTransmission("2026-10-13T14:40:00Z", "2026-10-14"))).toBe("13/10/2026 · 16 h 40");
    // 23 h 30 UTC le 13 = 01 h 30 le 14 à Uvira
    expect(n(momentTransmission("2026-10-13T23:30:00Z", "2026-10-14"))).toBe("01 h 30");
    expect(momentTransmission(null, "2026-10-14")).toBe("—");
  });
  it("file, annulés, état de la journée", () => {
    expect(texteFile(0)).toBe("(aucun acte en attente)");
    expect(texteFile(1)).toBe("(1 acte transmis par l'Officier)");
    expect(texteFile(3)).toBe("(3 actes transmis par l'Officier)");
    expect(texteAnnules(0)).toBe("");
    expect(texteAnnules(1)).toBe("dont 1 annulé");
    expect(texteAnnules(2)).toBe("dont 2 annulés");
    expect(etatJournee(null)).toBe("journée de caisse ouverte");
    expect(n(etatJournee("2026-10-14T15:05:00Z"))).toBe("journée de caisse clôturée à 17 h 05");
  });
});

describe("Encaissement possible ?", () => {
  const usd = { devise: "USD" as const };
  const cdf = { devise: "CDF" as const };
  it("journée clôturée : rien ne s'encaisse", () => {
    expect(obstacleEncaissement(cdf, { type: "du-jour", taux: 2850, heure: "08 h 00" }, "2026-10-14T15:05:00Z")).toBe(
      "La caisse est clôturée pour aujourd'hui : l'usager paiera demain.",
    );
  });
  it("acte en dollars sans aucun taux : bloqué ; avec le dernier taux (même ancien) : possible", () => {
    expect(obstacleEncaissement(usd, { type: "aucun" }, null)).toBe("Saisissez d'abord le taux du jour : cet acte est en dollars.");
    expect(obstacleEncaissement(usd, { type: "ancien", taux: 2800, date: "13/10/2026" }, null)).toBeNull();
    expect(obstacleEncaissement(cdf, { type: "aucun" }, null)).toBeNull();
  });
});

describe("Retour à l'accueil après l'écran d'encaissement (fichier 38)", () => {
  it("exonéré ou renvoyé : message ; un paramètre inventé est ignoré", async () => {
    const { annonceRetour } = await import("./accueil-caissier");
    expect(annonceRetour({ exonere: "MUL-EXNAIS-2026-000124" })).toBe("MUL-EXNAIS-2026-000124 a été exonéré : il est prêt à être délivré, sans paiement.");
    expect(annonceRetour({ renvoye: "KAV-ATRES-2026-000004" })).toBe("KAV-ATRES-2026-000004 a été renvoyé à l'Officier pour correction.");
    expect(annonceRetour({ exonere: "<script>alert(1)</script>" })).toBeNull();
    expect(annonceRetour({ renvoye: ["MUL-ATRES-2026-000001", "x"] })).toBeNull();
    expect(annonceRetour({})).toBeNull();
  });
});
