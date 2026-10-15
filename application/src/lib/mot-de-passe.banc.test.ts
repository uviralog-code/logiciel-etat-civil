// Fichier 17 — changement du mot de passe provisoire contre le banc (vrai Supabase Auth + vraie base)
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { connecterAgent } from "./connexion";
import { changerMotDePasse, MESSAGES_MDP } from "./mot-de-passe";

let banc: ReturnType<typeof brancherBanc>;
const nouveauClient = () =>
  createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

beforeEach(() => {
  banc = brancherBanc();
});

/** Agent avec mot de passe provisoire, connecté. */
async function agentProvisoire(role: "officier" | "caissier" | "admin" = "officier") {
  const agent = await creerAgent({ role, entite: "KAL", motDePasse: "Provisoire-7K4PX9", doitChanger: true });
  const client = nouveauClient();
  const connexion = await connecterAgent(client, { nom: agent.nom, motDePasse: "Provisoire-7K4PX9" });
  expect(connexion).toMatchObject({ ok: true, destination: "/mot-de-passe" });
  return { agent, client };
}
const doitChanger = (id: string) => sql(`select doit_changer_mot_de_passe from public.utilisateurs where id = '${id}'`);

describe("Changement réussi", () => {
  it("nouveau mot de passe enregistré, obligation levée, page suivante = espace de l'agent", async () => {
    const { agent, client } = await agentProvisoire();
    expect(await changerMotDePasse(client, { nouveau: "Kalundu-Uvira-2026", confirmation: "Kalundu-Uvira-2026" })).toEqual({ ok: true });
    expect(doitChanger(agent.id)).toBe("f");

    // L'ancien mot de passe ne marche plus, le nouveau oui — et mène directement à l'espace de l'agent
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: "Provisoire-7K4PX9" })).toMatchObject({ ok: false });
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: "Kalundu-Uvira-2026" })).toMatchObject({
      ok: true, destination: "/officier",
    });
  });

  it("le changement est noté au journal d'audit (qui, quand, quoi)", async () => {
    const { agent, client } = await agentProvisoire("caissier");
    await changerMotDePasse(client, { nouveau: "Caisse-Kalundu-2026", confirmation: "Caisse-Kalundu-2026" });
    const ligne = sql(`select operation, utilisateur_id = '${agent.id}', champs_modifies::text
                         from public.journal_audit
                        where table_nom = 'utilisateurs' and enregistrement_id = '${agent.id}'
                        order by id desc limit 1`);
    expect(ligne.split("|").slice(0, 2)).toEqual(["UPDATE", "t"]);
    expect(ligne).toContain("doit_changer_mot_de_passe");
  });

  it("les autres sessions ouvertes avec le mot de passe provisoire sont fermées", async () => {
    const { agent, client } = await agentProvisoire();
    const autre = nouveauClient();
    await autre.auth.signInWithPassword({ email: `${agent.nom}@agents.etatcivil-uvira.local`, password: "Provisoire-7K4PX9" });
    await changerMotDePasse(client, { nouveau: "Kalundu-Uvira-2026", confirmation: "Kalundu-Uvira-2026" });
    expect((await autre.auth.refreshSession()).error?.code).toBe("refresh_token_not_found");
    expect((await client.auth.refreshSession()).error).toBeNull(); // la session en cours reste ouverte
  });

  it("administrateur : après le mot de passe, direction le code de vérification", async () => {
    const { agent, client } = await agentProvisoire("admin");
    expect(await changerMotDePasse(client, { nouveau: "Admin-CDJP-Bukavu-2026", confirmation: "Admin-CDJP-Bukavu-2026" })).toEqual({ ok: true });
    expect(doitChanger(agent.id)).toBe("f");
    expect(await connecterAgent(nouveauClient(), { nom: agent.nom, motDePasse: "Admin-CDJP-Bukavu-2026" })).toMatchObject({
      ok: true, destination: "/verification",
    });
  });
});

describe("Changements refusés", () => {
  it("le même mot de passe que le provisoire est refusé par le service", async () => {
    const { agent, client } = await agentProvisoire();
    expect(await changerMotDePasse(client, { nouveau: "Provisoire-7K4PX9", confirmation: "Provisoire-7K4PX9" })).toEqual({
      ok: false, message: MESSAGES_MDP.identiqueAuProvisoire, champ: "nouveau",
    });
    expect(doitChanger(agent.id)).toBe("t");
  });

  it("le service refuse lui aussi un mot de passe trop court (même si l'écran était contourné)", async () => {
    const { agent, client } = await agentProvisoire();
    const { error } = await client.auth.updateUser({ password: "Court-123" });
    expect(error?.code).toBe("weak_password");
    expect(doitChanger(agent.id)).toBe("t");
  });

  it("sans session : il faut se reconnecter, rien n'est modifié", async () => {
    const r = await changerMotDePasse(nouveauClient(), { nouveau: "Kalundu-Uvira-2026", confirmation: "Kalundu-Uvira-2026" });
    expect(r).toMatchObject({ ok: false, reconnexion: true });
  });

  it("contournement : lever l'obligation en gardant le mot de passe provisoire est refusé par la base (migration 14)", async () => {
    const { agent, client } = await agentProvisoire();
    const { error } = await client.rpc("mot_de_passe_change");
    expect(error?.message).toContain("n'a pas été remplacé");
    expect(doitChanger(agent.id)).toBe("t");
  });

  it("personne ne peut lire les empreintes des mots de passe provisoires par l'API", async () => {
    const { client } = await agentProvisoire("admin");
    const { error } = await client.from("mots_de_passe_provisoires").select("*");
    expect(error?.code).toBe("42501"); // permission refusée
  });
});
