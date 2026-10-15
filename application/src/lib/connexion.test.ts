// Fichier 16 — cas difficiles à provoquer sur le banc (limite d'essais, journal en panne…)
import { AuthApiError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { connecterAgent, decrireNavigateur, destinationApresConnexion, espaceDuRole, MESSAGES } from "./connexion";

/** Faux client Supabase : on choisit la réponse de chaque étape. */
function fauxClient(options: {
  refus?: AuthApiError;
  profil?: Record<string, unknown> | null;
  erreurJournalReussite?: boolean;
}) {
  const appelsJournal: Record<string, unknown>[] = [];
  const signOut = vi.fn(async () => ({ error: null }));
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () =>
        options.refus
          ? { data: { user: null, session: null }, error: options.refus }
          : { data: { user: { id: "u-1" }, session: {} }, error: null },
      ),
      signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: options.profil ?? null, error: null }) }),
      }),
    }),
    rpc: vi.fn(async (_nom: string, args: Record<string, unknown>) => {
      appelsJournal.push(args);
      if (args.p_succes && options.erreurJournalReussite) return { data: null, error: { message: "panne" } };
      return { data: 1, error: null };
    }),
  };
  return { client: client as unknown as SupabaseClient, appelsJournal, signOut };
}

const profilOfficier = {
  nom_utilisateur: "mulongwe.officier",
  nom_complet: "Amani Bisimwa",
  role: "officier",
  actif: true,
  doit_changer_mot_de_passe: false,
  double_verification: false,
  entite: { code: "MUL", nom: "Commune de Mulongwe" },
};

describe("Page suivante selon le profil", () => {
  it.each([
    [{ role: "officier", doitChangerMotDePasse: false, doubleVerification: false }, "/officier"],
    [{ role: "caissier", doitChangerMotDePasse: false, doubleVerification: false }, "/caissier"],
    [{ role: "admin", doitChangerMotDePasse: false, doubleVerification: true }, "/verification"],
    [{ role: "admin", doitChangerMotDePasse: true, doubleVerification: true }, "/mot-de-passe"],
    [{ role: "caissier", doitChangerMotDePasse: true, doubleVerification: false }, "/mot-de-passe"],
    [{ role: "caissier", doitChangerMotDePasse: false, doubleVerification: true }, "/verification"],
  ] as const)("%o → %s", (profil, attendu) => {
    expect(destinationApresConnexion(profil)).toBe(attendu);
  });
});

describe("Espace de chaque rôle", () => {
  it.each([["admin", "/admin"], ["officier", "/officier"], ["caissier", "/caissier"]] as const)("%s → %s", (role, attendu) => {
    expect(espaceDuRole(role)).toBe(attendu);
  });
});

describe("Description du navigateur pour le journal", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", "Chrome 140 · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0", "Edge 140 · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0", "Firefox 128 · Windows"],
    ["Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36", "Chrome 139 · Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15", "Safari 18 · macOS"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "Chrome 141 · Linux"],
    ["un-robot/1.0", "Navigateur inconnu"],
  ])("%s", (agent, attendu) => {
    expect(decrireNavigateur(agent)).toBe(attendu);
  });
  it("aucun renseignement → rien", () => {
    expect(decrireNavigateur(undefined)).toBeNull();
  });
});

describe("Cas particuliers", () => {
  it("trop d'essais : message d'attente, échec noté", async () => {
    const { client, appelsJournal } = fauxClient({
      refus: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"),
    });
    const r = await connecterAgent(client, { nom: "kalundu.caissier", motDePasse: "x" });
    expect(r).toEqual({ ok: false, message: MESSAGES.tropDEssais });
    expect(appelsJournal[0]).toMatchObject({ p_succes: false, p_motif_echec: "trop de tentatives" });
  });

  it("refus inattendu du service : message prudent, code noté au journal", async () => {
    const { client, appelsJournal } = fauxClient({ refus: new AuthApiError("boom", 500, "unexpected_failure") });
    const r = await connecterAgent(client, { nom: "kalundu.caissier", motDePasse: "x" });
    expect(r).toEqual({ ok: false, message: MESSAGES.inattendu });
    expect(appelsJournal[0].p_motif_echec).toBe("erreur du service de connexion (unexpected_failure)");
  });

  it("journal en panne au moment d'une réussite : la session est refermée (toute connexion doit être notée)", async () => {
    const { client, signOut } = fauxClient({ profil: profilOfficier, erreurJournalReussite: true });
    const r = await connecterAgent(client, { nom: "mulongwe.officier", motDePasse: "x" });
    expect(r).toEqual({ ok: false, message: MESSAGES.journal });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("réussite : le nom normalisé et le navigateur sont transmis au journal", async () => {
    const { client, appelsJournal } = fauxClient({ profil: profilOfficier });
    const r = await connecterAgent(client, { nom: " Mulongwe.Officier ", motDePasse: "x" }, { navigateur: "Firefox 128 · Windows" });
    expect(r.ok).toBe(true);
    expect(appelsJournal).toEqual([
      { p_nom_utilisateur: "mulongwe.officier", p_succes: true, p_navigateur: "Firefox 128 · Windows", p_poste: null },
    ]);
  });
});
