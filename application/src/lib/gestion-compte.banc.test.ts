// Fichier 22 — réinitialisation et désactivation contre le banc (vrai Supabase Auth + vraie base)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent, MESSAGES } from "./connexion";
import { creerCompteAgent } from "./creation-compte";
import { desactiverCompte, MESSAGES_GESTION, reinitialiserMotDePasse } from "./gestion-compte";
import { adresseInterne } from "./identifiants";
import { changerMotDePasse } from "./mot-de-passe";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
let service: SupabaseClient;
beforeEach(() => {
  banc = brancherBanc();
  service = createClient(banc.url, banc.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

async function administrateur(verifie = true) {
  const admin = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: admin.nom, motDePasse: admin.motDePasse });
  if (verifie) {
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: admin.nom });
  }
  return { admin, client };
}
async function agentConnecte(role: "officier" | "caissier", entite: "MUL" | "KAV" | "KAL" | "BAV") {
  const agent = await creerAgent({ role, entite });
  const client = nouveauClient();
  await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse });
  return { agent, client };
}
const entitesVues = async (c: SupabaseClient) => (await c.from("entites").select("code")).data?.length ?? 0;

describe("Réinitialisation du mot de passe", () => {
  it("nouveau provisoire ; l'ancien ne marche plus ; sessions fermées ; droits coupés tout de suite ; changement imposé", async () => {
    const { client: admin, admin: compteAdmin } = await administrateur();
    const { agent, client: poste } = await agentConnecte("caissier", "MUL");
    expect(await entitesVues(poste)).toBe(1);

    const r = await reinitialiserMotDePasse(admin, service, agent.id);
    expect(r).toMatchObject({ ok: true, nomUtilisateur: agent.nom });
    if (!r.ok) return;
    expect(r.motDePasse).toMatch(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);

    // Session déjà ouverte sur le poste : plus de renouvellement, plus de données, plus de changement de mot de passe
    expect((await poste.auth.refreshSession()).error).not.toBeNull();
    expect(await entitesVues(poste)).toBe(0);
    expect((await poste.auth.updateUser({ password: "Pirate-Kalundu-2026" })).error).not.toBeNull();

    // Ancien mot de passe refusé ; le nouveau mène au changement obligatoire
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: agent.motDePasse })).toMatchObject({ ok: false });
    const neuf = nouveauClient();
    expect(await connecterAgent(neuf, { nom: agent.nom, motDePasse: r.motDePasse })).toMatchObject({ ok: true, destination: "/mot-de-passe" });
    expect(await entitesVues(neuf)).toBe(0); // migration 16 : pas de droits avant le changement
    expect(await changerMotDePasse(neuf, { nouveau: "Mulongwe-Caisse-2026", confirmation: "Mulongwe-Caisse-2026" })).toEqual({ ok: true });
    await neuf.auth.refreshSession(); // nouveau jeton après le changement
    expect(await entitesVues(neuf)).toBe(1);

    // Noté au journal d'audit, au nom de l'administrateur
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'utilisateurs' and enregistrement_id = '${agent.id}'
                  and utilisateur_id = '${compteAdmin.id}' and 'doit_changer_mot_de_passe' = any(champs_modifies)`)).toBe("1");
  });

  it("garder le nouveau provisoire en se contentant de lever l'obligation : refusé (migration 14)", async () => {
    const { client: admin } = await administrateur();
    const { agent } = await agentConnecte("officier", "KAV");
    const r = await reinitialiserMotDePasse(admin, service, agent.id);
    if (!r.ok) throw new Error(r.message);
    const neuf = nouveauClient();
    await connecterAgent(neuf, { nom: agent.nom, motDePasse: r.motDePasse });
    expect((await neuf.rpc("mot_de_passe_change")).error?.message).toContain("n'a pas été remplacé");
  });
});

describe("Désactivation", () => {
  it("droits coupés, connexion bloquée, nom archivé et libéré, poste à pourvoir, historique conservé", async () => {
    const { client: admin } = await administrateur();
    const { agent, client: poste } = await agentConnecte("officier", "BAV");

    const r = await desactiverCompte(admin, service, agent.id);
    expect(r).toMatchObject({ ok: true, nomArchive: expect.stringMatching(new RegExp(`^${agent.nom.replace(".", "\\.")}\\.ancien\\d{8}$`)) });
    if (!r.ok) return;

    expect(await entitesVues(poste)).toBe(0); // session déjà ouverte : plus aucun droit
    expect((await poste.auth.refreshSession()).error?.code).toBe("user_banned");
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: agent.motDePasse })).toMatchObject({
      ok: false, message: MESSAGES.identifiants, // l'ancien nom ne correspond plus à aucun compte
    });
    expect(await connecterAgent(nouveauClient(), { nom: r.nomArchive, motDePasse: agent.motDePasse })).toEqual({
      ok: false, message: MESSAGES.compteDesactive,
    });
    expect(sql(`select email from auth.users where id = '${agent.id}'`)).toBe(adresseInterne(r.nomArchive));
    expect(sql(`select count(*) from public.utilisateurs where id = '${agent.id}' and not actif`)).toBe("1");

    // Le remplaçant reçoit directement le nom habituel
    const remplacant = await creerCompteAgent(admin, service, { entite: "BAV", role: "officier", nomComplet: "Remplaçant", nomUtilisateur: agent.nom });
    expect(remplacant).toMatchObject({ ok: true, nomUtilisateur: agent.nom });
  });

  it("un compte déjà désactivé n'est pas « redésactivé » (rien ne change)", async () => {
    const { client: admin } = await administrateur();
    const { agent } = await agentConnecte("caissier", "KAL");
    const premiere = await desactiverCompte(admin, service, agent.id);
    const seconde = await desactiverCompte(admin, service, agent.id);
    expect(premiere.ok && seconde.ok && premiere.nomArchive === seconde.nomArchive).toBe(true);
    expect(sql(`select count(*) from public.journal_audit where enregistrement_id = '${agent.id}' and 'actif' = any(champs_modifies)`)).toBe("1");
  });
});

describe("Refus", () => {
  it("l'administrateur ne se gère pas depuis cet écran", async () => {
    const { client: admin, admin: compte } = await administrateur();
    expect(await reinitialiserMotDePasse(admin, service, compte.id)).toEqual({ ok: false, message: MESSAGES_GESTION.administrateur });
    expect(await desactiverCompte(admin, service, compte.id)).toEqual({ ok: false, message: MESSAGES_GESTION.administrateur });
  });

  it("administrateur sans le code à 6 chiffres : rien n'est modifié, le mot de passe de l'agent reste valable", async () => {
    const { client: admin } = await administrateur(false);
    const { agent } = await agentConnecte("officier", "MUL");
    expect((await reinitialiserMotDePasse(admin, service, agent.id)).ok).toBe(false);
    expect((await desactiverCompte(admin, service, agent.id)).ok).toBe(false);
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: agent.motDePasse })).toMatchObject({ ok: true });
  });

  it("un officier ne peut ni réinitialiser ni désactiver le compte de son caissier", async () => {
    const { client: officier } = await agentConnecte("officier", "KAL");
    const caissier = await creerAgent({ role: "caissier", entite: "KAL" });
    expect((await reinitialiserMotDePasse(officier, service, caissier.id)).ok).toBe(false);
    expect((await desactiverCompte(officier, service, caissier.id)).ok).toBe(false);
    expect(await connecterAgent(nouveauClient(), { nom: caissier.nom, motDePasse: caissier.motDePasse })).toMatchObject({ ok: true });
  });
});
