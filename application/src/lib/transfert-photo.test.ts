// Fichier 34 — transfert téléphone → ordinateur : base64, secret, temps restant
import { describe, expect, it } from "vitest";
import { adresseTelephone, depuisBase64, secretValide, tempsRestant, versBase64 } from "./transfert-photo";

describe("Base64 (photos envoyées par le téléphone)", () => {
  it("aller-retour exact, même pour une grosse photo", () => {
    const octets = new Uint8Array(300_000).map((_, i) => (i * 7919) % 256);
    expect(depuisBase64(versBase64(octets))).toEqual(octets);
    expect(versBase64(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("/9j/");
    expect(depuisBase64("/9j/\n")).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });
});

describe("Lien du QR code", () => {
  it("adresse du téléphone ; forme du secret (43 caractères sûrs)", () => {
    const secret = "A".repeat(40) + "-_9";
    expect(adresseTelephone("https://etatcivil-uvira.cd", secret)).toBe(`https://etatcivil-uvira.cd/photo/${secret}`);
    expect([secretValide(secret), secretValide("court"), secretValide(`${secret}x`), secretValide("A".repeat(42) + "/"), secretValide(undefined)]).toEqual([
      true, false, false, false, false,
    ]);
  });

  it("temps restant affiché", () => {
    const fin = "2026-10-14T10:10:00Z";
    const t = (iso: string) => tempsRestant(fin, new Date(iso).getTime());
    expect(t("2026-10-14T10:00:00Z")).toEqual({ minutes: 10, texte: "encore 10 min", expire: false });
    expect(t("2026-10-14T10:08:30Z")).toEqual({ minutes: 2, texte: "encore 2 min", expire: false });
    expect(t("2026-10-14T10:09:30Z")).toEqual({ minutes: 1, texte: "moins d'une minute", expire: false });
    expect(t("2026-10-14T10:10:00Z")).toEqual({ minutes: 0, texte: "expiré", expire: true });
  });
});
