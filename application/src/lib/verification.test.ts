// Fichier 18 — cas difficiles à provoquer sur le banc
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { codeTotp } from "@/test/totp";
import { cleLisible, MESSAGES_CODE, nettoyerCode, verifierCode } from "./verification";

function fauxClient(refus?: Error) {
  const rpc = vi.fn(async () => ({ data: 1, error: null }));
  const challengeAndVerify = vi.fn(async () => ({ data: refus ? null : {}, error: refus ?? null }));
  const client = {
    auth: { mfa: { challengeAndVerify, listFactors: async () => ({ data: { totp: [{ id: "f-1" }], all: [] }, error: null }) } },
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, challengeAndVerify };
}
const contexte = { nomUtilisateur: "cdjp.admin" };

describe("Mise en forme", () => {
  it("la clé secrète est présentée par groupes de 4", () => {
    expect(cleLisible("5MC4BF6N36U7LA5YREEJH7WCGU43FO4D")).toBe("5MC4 BF6N 36U7 LA5Y REEJ H7WC GU43 FO4D");
  });
  it.each([["123456", "123456"], ["123 456", "123456"], [" 123456 ", "123456"], ["12345", null], ["1234567", null], ["12a456", null]])(
    "code « %s » → %s",
    (saisie, attendu) => expect(nettoyerCode(saisie)).toBe(attendu),
  );
});

describe("Réponses du service", () => {
  it("bon code : le téléphone déjà relié est utilisé", async () => {
    const { client, challengeAndVerify } = fauxClient();
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: true });
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-1", code: "123456" });
  });
  it("code incorrect : message + inscription au journal", async () => {
    const { client, rpc } = fauxClient(new AuthApiError("Invalid TOTP code entered", 422, "mfa_verification_failed"));
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: false, message: MESSAGES_CODE.incorrect });
    expect(rpc).toHaveBeenCalledWith("journaliser_connexion", expect.objectContaining({
      p_nom_utilisateur: "cdjp.admin", p_succes: false, p_motif_echec: "code de vérification incorrect",
    }));
  });
  it("délai dépassé", async () => {
    const { client, rpc } = fauxClient(new AuthApiError("expired", 422, "mfa_challenge_expired"));
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: false, message: MESSAGES_CODE.expire });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("trop d'essais", async () => {
    const { client } = fauxClient(new AuthApiError("rate", 429, "over_request_rate_limit"));
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: false, message: MESSAGES_CODE.tropDEssais });
  });
  it("serveur injoignable", async () => {
    const { client } = fauxClient(new AuthRetryableFetchError("fetch failed", 0));
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: false, message: MESSAGES_CODE.injoignable });
  });
  it("session disparue : il faut se reconnecter", async () => {
    const { client } = fauxClient(new AuthSessionMissingError());
    expect(await verifierCode(client, { code: "123456" }, contexte)).toEqual({ ok: false, message: MESSAGES_CODE.sessionExpiree, reconnexion: true });
  });
});

describe("Outil de test : calcul du code TOTP", () => {
  it("reproduit les valeurs officielles de la norme (RFC 6238, annexe B)", () => {
    // Clé « 12345678901234567890 » en base32
    const cle = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(codeTotp(cle, 59_000)).toBe("287082");
    expect(codeTotp(cle, 1_111_111_109_000)).toBe("081804");
    expect(codeTotp(cle, 1_234_567_890_000)).toBe("005924");
  });
});
