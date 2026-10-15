// Fichier 17 — règles et cas difficiles à provoquer sur le banc
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { changerMotDePasse, LONGUEUR_MINIMALE, MESSAGES_MDP, reglesMotDePasse } from "./mot-de-passe";

function fauxClient(options: { refus?: Error; erreurFin?: boolean } = {}) {
  const updateUser = vi.fn(async () => ({ data: { user: null }, error: options.refus ?? null }));
  const rpc = vi.fn(async () => ({ data: null, error: options.erreurFin ? { message: "panne" } : null }));
  return { client: { auth: { updateUser }, rpc } as unknown as SupabaseClient, updateUser, rpc };
}

const bon = { nouveau: "Uvira-Kalundu-2026", confirmation: "Uvira-Kalundu-2026" };

describe("Règles affichées sous les champs", () => {
  it("rien n'est coché tant que rien n'est saisi", () => {
    expect(reglesMotDePasse("", "").map((r) => r.respectee)).toEqual([false, false]);
  });
  it(`${LONGUEUR_MINIMALE} caractères : la longueur est cochée (les lettres accentuées comptent pour un)`, () => {
    expect(reglesMotDePasse("ééééééééé", "")[0].respectee).toBe(false);
    expect(reglesMotDePasse("éééééééééé", "")[0].respectee).toBe(true);
  });
  it("deux saisies identiques : cochée ; une lettre de différence : non", () => {
    expect(reglesMotDePasse("Uvira-2026-a", "Uvira-2026-a")[1].respectee).toBe(true);
    expect(reglesMotDePasse("Uvira-2026-a", "Uvira-2026-A")[1].respectee).toBe(false);
  });
  it("les libellés sont ceux de la maquette", () => {
    expect(reglesMotDePasse("", "").map((r) => r.libelle)).toEqual(["Au moins 10 caractères", "Les deux saisies sont identiques"]);
  });
});

describe("Contrôles avant envoi : rien n'est envoyé si une règle n'est pas respectée", () => {
  it("trop court", async () => {
    const { client, updateUser } = fauxClient();
    expect(await changerMotDePasse(client, { nouveau: "court", confirmation: "court" })).toEqual({
      ok: false, message: MESSAGES_MDP.tropCourt, champ: "nouveau",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("saisies différentes", async () => {
    const { client, updateUser } = fauxClient();
    expect(await changerMotDePasse(client, { nouveau: bon.nouveau, confirmation: "Autre-chose-2026" })).toEqual({
      ok: false, message: MESSAGES_MDP.differents, champ: "confirmation",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("Réponses du service", () => {
  it("réussite : mot de passe enregistré PUIS obligation levée", async () => {
    const { client, updateUser, rpc } = fauxClient();
    expect(await changerMotDePasse(client, bon)).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: bon.nouveau });
    expect(rpc).toHaveBeenCalledWith("mot_de_passe_change");
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });
  it("serveur injoignable", async () => {
    const { client, rpc } = fauxClient({ refus: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await changerMotDePasse(client, bon)).toEqual({ ok: false, message: MESSAGES_MDP.injoignable });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("session disparue : il faut se reconnecter", async () => {
    const { client } = fauxClient({ refus: new AuthSessionMissingError() });
    expect(await changerMotDePasse(client, bon)).toMatchObject({ ok: false, reconnexion: true, message: MESSAGES_MDP.sessionExpiree });
  });
  it("session révoquée côté service (401) : il faut se reconnecter", async () => {
    const { client } = fauxClient({ refus: new AuthApiError("invalid JWT", 401, "bad_jwt") });
    expect(await changerMotDePasse(client, bon)).toMatchObject({ ok: false, reconnexion: true });
  });
  it("erreur inattendue : message prudent", async () => {
    const { client } = fauxClient({ refus: new AuthApiError("boom", 500, "unexpected_failure") });
    expect(await changerMotDePasse(client, bon)).toEqual({ ok: false, message: MESSAGES_MDP.inattendu });
  });
});

describe("Fin de l'opération interrompue", () => {
  it("mot de passe changé mais obligation non levée : on le dit clairement", async () => {
    const { client } = fauxClient({ erreurFin: true });
    expect(await changerMotDePasse(client, bon)).toEqual({ ok: false, message: MESSAGES_MDP.finIncomplete, motDePasseEnregistre: true });
  });
  it("nouvel essai : seule la fin est refaite (le mot de passe n'est pas renvoyé)", async () => {
    const { client, updateUser, rpc } = fauxClient();
    expect(await changerMotDePasse(client, { nouveau: "", confirmation: "" }, { motDePasseDejaEnregistre: true })).toEqual({ ok: true });
    expect(updateUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
  });
});
