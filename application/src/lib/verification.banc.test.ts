// Fichier 18 — code de vérification contre le banc (vrai Supabase Auth + vraie base, migration 15)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent } from "./connexion";
import { cleLisible, commencerMiseEnPlace, MESSAGES_CODE, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () =>
  createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

async function adminConnecte() {
  const agent = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  expect(await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse })).toMatchObject({
    ok: true, destination: "/verification",
  });
  return { agent, client };
}
const niveau = async (c: SupabaseClient) => (await c.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel;
const nbEntitesVues = async (c: SupabaseClient) => (await c.from("entites").select("code")).data?.length;
/** Code d'une autre période de 30 s : forcément refusé (et différent du bon). */
const mauvaisCode = (cle: string) => codeTotp(cle, Date.now(), 5);

describe("Avant le code : l'administrateur n'a aucun pouvoir (migration 15)", () => {
  it("avec le mot de passe seul, il ne voit ni les entités ni les autres comptes", async () => {
    await creerAgent({ role: "officier", entite: "MUL" });
    const { agent, client } = await adminConnecte();
    expect(await niveau(client)).toBe("aal1");
    expect(await nbEntitesVues(client)).toBe(0);
    const { data: comptes } = await client.from("utilisateurs").select("nom_utilisateur");
    expect(comptes).toEqual([{ nom_utilisateur: agent.nom }]);
  });

  it("les agents sans double vérification gardent leurs droits avec le mot de passe seul", async () => {
    const officier = await creerAgent({ role: "officier", entite: "KAV" });
    const client = nouveauClient();
    await connecterAgent(client, { nom: officier.nom, motDePasse: officier.motDePasse });
    expect(await niveau(client)).toBe("aal1");
    expect(await nbEntitesVues(client)).toBe(1);
  });
});

describe("Première fois : mise en place du téléphone", () => {
  it("QR code + clé, mauvais code refusé (et noté), bon code accepté → tous les pouvoirs", async () => {
    const { agent, client } = await adminConnecte();
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    const { idFacteur, qrCode, cle } = debut.miseEnPlace;
    expect(qrCode.startsWith("data:image/svg+xml")).toBe(true);
    expect(cle).toMatch(/^[A-Z2-7]{32}$/);
    expect(cleLisible(cle).split(" ")).toHaveLength(8);

    const refus = await verifierCode(client, { code: mauvaisCode(cle), idFacteur }, { nomUtilisateur: agent.nom });
    expect(refus).toEqual({ ok: false, message: MESSAGES_CODE.incorrect });
    expect(sql(`select motif_echec from public.journal_connexions where nom_utilisateur_saisi = '${agent.nom}' and not succes`))
      .toBe("code de vérification incorrect");
    expect(await niveau(client)).toBe("aal1");

    expect(await verifierCode(client, { code: codeTotp(cle), idFacteur }, { nomUtilisateur: agent.nom })).toEqual({ ok: true });
    expect(await niveau(client)).toBe("aal2");
    expect(await nbEntitesVues(client)).toBe(4);
    expect(sql(`select count(*) from auth.mfa_factors where user_id = '${agent.id}' and status = 'verified'`)).toBe("1");
  });

  it("mise en place abandonnée puis reprise : l'ancienne est effacée, pas de doublon", async () => {
    const { agent, client } = await adminConnecte();
    expect((await commencerMiseEnPlace(client)).ok).toBe(true);
    const reprise = await commencerMiseEnPlace(client);
    expect(reprise.ok).toBe(true);
    expect(sql(`select count(*) from auth.mfa_factors where user_id = '${agent.id}'`)).toBe("1");
  });

  it("le code peut être tapé avec des espaces (« 123 456 »)", async () => {
    const { agent, client } = await adminConnecte();
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    const code = codeTotp(debut.miseEnPlace.cle);
    const r = await verifierCode(client, { code: `${code.slice(0, 3)} ${code.slice(3)}`, idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: agent.nom });
    expect(r).toEqual({ ok: true });
  });
});

describe("Connexions suivantes", () => {
  it("le code du téléphone déjà relié suffit ; sans lui, toujours aucun pouvoir", async () => {
    const { agent, client } = await adminConnecte();
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: agent.nom });

    // Nouvelle connexion, un autre jour : le mot de passe ne suffit plus
    const demain = nouveauClient();
    await connecterAgent(demain, { nom: agent.nom, motDePasse: agent.motDePasse });
    expect(await niveau(demain)).toBe("aal1");
    expect(await nbEntitesVues(demain)).toBe(0);
    expect((await demain.auth.mfa.getAuthenticatorAssuranceLevel()).data?.nextLevel).toBe("aal2");

    expect(await verifierCode(demain, { code: codeTotp(debut.miseEnPlace.cle) }, { nomUtilisateur: agent.nom })).toEqual({ ok: true });
    expect(await nbEntitesVues(demain)).toBe(4);
  });

  it("sans téléphone relié, la vérification directe propose de recommencer la mise en place", async () => {
    const { agent, client } = await adminConnecte();
    expect(await verifierCode(client, { code: "123456" }, { nomUtilisateur: agent.nom })).toEqual({
      ok: false, message: MESSAGES_CODE.aucunTelephone, recommencer: true,
    });
  });

  it("code mal formé : refusé sans rien envoyer", async () => {
    const { agent, client } = await adminConnecte();
    expect(await verifierCode(client, { code: "12a45" }, { nomUtilisateur: agent.nom })).toEqual({ ok: false, message: MESSAGES_CODE.format });
  });
});
