// @vitest-environment node
// Fichier 21 — l'action serveur revérifie le droit d'agir avant tout
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConnecte } from "@/lib/session";

const lireAgentConnecte = vi.fn<() => Promise<AgentConnecte | null>>();
const creerCompteAgent = vi.fn();
const reinitialiserMotDePasse = vi.fn();
const desactiverCompte = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/session", () => ({ lireAgentConnecte: () => lireAgentConnecte() }));
vi.mock("@/lib/creation-compte", () => ({ creerCompteAgent: (...a: unknown[]) => creerCompteAgent(...a) }));
vi.mock("@/lib/gestion-compte", () => ({
  reinitialiserMotDePasse: (...a: unknown[]) => reinitialiserMotDePasse(...a),
  desactiverCompte: (...a: unknown[]) => desactiverCompte(...a),
}));
vi.mock("@/lib/supabase/serveur", () => ({ creerClientServeur: async () => "client-session" }));
vi.mock("@/lib/supabase/admin", () => ({ creerClientAdmin: () => "client-service" }));
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const { creerCompte, desactiver, reinitialiser } = await import("./actions");

const agent = (role: "admin" | "officier", niveau: "aal1" | "aal2"): AgentConnecte => ({
  id: "u", actif: true, niveau,
  profil: { nomUtilisateur: "x", nomComplet: "X", role, doitChangerMotDePasse: false, doubleVerification: role === "admin", entite: null },
});
const formulaire = () => {
  const f = new FormData();
  f.set("entite", "BAV"); f.set("role", "caissier"); f.set("nomComplet", "Mukeba Esther"); f.set("nomUtilisateur", "bavira.caissier");
  return f;
};

beforeEach(() => {
  [lireAgentConnecte, creerCompteAgent, reinitialiserMotDePasse, desactiverCompte, refresh].forEach((f) => f.mockReset());
});

describe("Droit d'agir", () => {
  it.each([
    ["personne n'est connecté", null],
    ["un officier", agent("officier", "aal1")],
    ["l'administrateur sans son code à 6 chiffres", agent("admin", "aal1")],
  ])("%s → refusé, rien n'est tenté", async (_cas, qui) => {
    lireAgentConnecte.mockResolvedValue(qui);
    const r = await creerCompte({ ok: null }, formulaire());
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("réservée à l'administrateur") });
    expect(creerCompteAgent).not.toHaveBeenCalled();
  });

  it("administrateur vérifié → création demandée avec SA session et la clé de service ; tableau remis à jour", async () => {
    lireAgentConnecte.mockResolvedValue(agent("admin", "aal2"));
    creerCompteAgent.mockResolvedValue({ ok: true, motDePasse: "7K4-PX9-QM2" });
    const r = await creerCompte({ ok: null }, formulaire());
    expect(r).toMatchObject({ ok: true });
    expect(creerCompteAgent).toHaveBeenCalledWith("client-session", "client-service", {
      entite: "BAV", role: "caissier", nomComplet: "Mukeba Esther", nomUtilisateur: "bavira.caissier",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("échec de la création : le tableau n'est pas rechargé inutilement", async () => {
    lireAgentConnecte.mockResolvedValue(agent("admin", "aal2"));
    creerCompteAgent.mockResolvedValue({ ok: false, message: "Ce poste a déjà un agent actif." });
    await creerCompte({ ok: null }, formulaire());
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Réinitialiser et désactiver (fichier 22) : même contrôle", () => {
  it.each([
    ["personne n'est connecté", null],
    ["un officier", agent("officier", "aal1")],
    ["l'administrateur sans son code à 6 chiffres", agent("admin", "aal1")],
  ])("%s → refusé, rien n'est tenté", async (_cas, qui) => {
    lireAgentConnecte.mockResolvedValue(qui);
    expect((await reinitialiser("u-42")).ok).toBe(false);
    expect((await desactiver("u-42")).ok).toBe(false);
    expect(reinitialiserMotDePasse).not.toHaveBeenCalled();
    expect(desactiverCompte).not.toHaveBeenCalled();
  });

  it("administrateur vérifié → opérations faites avec SA session ; tableau remis à jour", async () => {
    lireAgentConnecte.mockResolvedValue(agent("admin", "aal2"));
    reinitialiserMotDePasse.mockResolvedValue({ ok: true });
    desactiverCompte.mockResolvedValue({ ok: true });
    await reinitialiser("u-42");
    await desactiver("u-42");
    expect(reinitialiserMotDePasse).toHaveBeenCalledWith("client-session", "client-service", "u-42");
    expect(desactiverCompte).toHaveBeenCalledWith("client-session", "client-service", "u-42");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
