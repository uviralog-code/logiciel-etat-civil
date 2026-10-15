// Fichier 16 — la logique de connexion contre le banc d'essai (vrai Supabase Auth + vraie base).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, creerCompte, nomUnique, sql } from "@/test/banc";
import { connecterAgent, MESSAGES } from "./connexion";

let banc: ReturnType<typeof brancherBanc>;
let client: SupabaseClient;
const contexte = { navigateur: "Chrome 140 · Windows" };

beforeEach(() => {
  banc = brancherBanc();
  client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
});

/** Dernière ligne du journal des connexions pour un nom saisi. */
function journal(saisi: string) {
  const ligne = sql(`select succes, coalesce(motif_echec, ''), coalesce(utilisateur_id::text, ''),
                            coalesce(host(adresse_ip), ''), coalesce(navigateur, ''), hors_ligne
                       from public.journal_connexions where nom_utilisateur_saisi = '${saisi}'
                      order by id desc limit 1`);
  if (!ligne) return null;
  const [succes, motif, utilisateur, ip, navigateur, horsLigne] = ligne.split("|");
  return { succes: succes === "t", motif, utilisateur, ip, navigateur, horsLigne: horsLigne === "t" };
}
const nombreDansJournal = (saisi: string) =>
  Number(sql(`select count(*) from public.journal_connexions where nom_utilisateur_saisi = '${saisi}'`));

describe("Connexions réussies", () => {
  it("officier : envoyé vers son espace, connexion inscrite au journal avec l'adresse du poste", async () => {
    const agent = await creerAgent({ role: "officier", entite: "MUL", nomComplet: "Amani Bisimwa" });
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse }, contexte);

    expect(r).toMatchObject({
      ok: true,
      destination: "/officier",
      profil: { nomUtilisateur: agent.nom, nomComplet: "Amani Bisimwa", role: "officier", entite: { code: "MUL" } },
    });
    expect(journal(agent.nom)).toEqual({
      succes: true, motif: "", utilisateur: agent.id, ip: "127.0.0.1", navigateur: "Chrome 140 · Windows", horsLigne: false,
    });
    // La règle des 7 jours hors-ligne repart de cette connexion
    expect(sql(`select derniere_connexion_en_ligne > now() - interval '1 minute' from public.utilisateurs where id = '${agent.id}'`)).toBe("t");
    // La session est bien ouverte
    expect((await client.auth.getSession()).data.session?.user.id).toBe(agent.id);
  });

  it("le nom peut être tapé avec des majuscules ou des espaces autour", async () => {
    const agent = await creerAgent({ role: "caissier", entite: "KAV" });
    const r = await connecterAgent(client, { nom: `  ${agent.nom.toUpperCase()} `, motDePasse: agent.motDePasse });
    expect(r).toMatchObject({ ok: true, destination: "/caissier", profil: { entite: { code: "KAV" } } });
  });

  it("administrateur : envoyé vers le code de vérification (double vérification)", async () => {
    const agent = await creerAgent({ role: "admin" });
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse });
    expect(r).toMatchObject({ ok: true, destination: "/verification", profil: { role: "admin", entite: null } });
  });

  it("mot de passe provisoire : envoyé d'abord vers le changement de mot de passe", async () => {
    const agent = await creerAgent({ role: "officier", entite: "KAL", doitChanger: true });
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse });
    expect(r).toMatchObject({ ok: true, destination: "/mot-de-passe" });
  });
});

describe("Connexions refusées — toujours inscrites au journal", () => {
  it("mauvais mot de passe : message général, échec noté et rattaché au compte", async () => {
    const agent = await creerAgent({ role: "officier", entite: "BAV" });
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: "pas-le-bon" }, contexte);
    expect(r).toEqual({ ok: false, message: MESSAGES.identifiants, champ: "motDePasse" });
    expect(journal(agent.nom)).toMatchObject({
      succes: false, motif: "nom d'utilisateur ou mot de passe incorrect", utilisateur: agent.id, ip: "127.0.0.1",
    });
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  it("nom inconnu : EXACTEMENT le même message (on ne révèle pas quels comptes existent)", async () => {
    const nom = nomUnique("inconnu");
    const r = await connecterAgent(client, { nom, motDePasse: "MotDePasse-2026" });
    expect(r).toEqual({ ok: false, message: MESSAGES.identifiants, champ: "motDePasse" });
    expect(journal(nom)).toMatchObject({ succes: false, utilisateur: "" });
  });

  it("nom mal formé : explication du format, rien n'est envoyé au service de connexion", async () => {
    const r = await connecterAgent(client, { nom: "mulongwe officier", motDePasse: "x" });
    expect(r).toEqual({ ok: false, message: MESSAGES.nomMalForme, champ: "nom" });
    expect(journal("mulongwe officier")).toMatchObject({ succes: false, motif: "nom d'utilisateur mal formé" });
  });

  it("champs vides : rien n'est envoyé, rien n'est noté", async () => {
    expect(await connecterAgent(client, { nom: "  ", motDePasse: "x" })).toMatchObject({ ok: false, champ: "nom" });
    const nom = nomUnique();
    expect(await connecterAgent(client, { nom, motDePasse: "" })).toMatchObject({ ok: false, champ: "motDePasse" });
    expect(nombreDansJournal(nom)).toBe(0);
  });

  it("compte désactivé dans le logiciel : refusé, session refermée, échec noté", async () => {
    const agent = await creerAgent({ role: "caissier", entite: "MUL" });
    sql(`update public.utilisateurs set actif = false where id = '${agent.id}'`);
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse });
    expect(r).toEqual({ ok: false, message: MESSAGES.compteDesactive });
    expect((await client.auth.getSession()).data.session).toBeNull();
    // Désactivé, le compte a été renommé (fichier 13) : l'échec est noté sous le nom tapé
    expect(journal(agent.nom)).toMatchObject({ succes: false, motif: "compte désactivé" });
  });

  it("compte bloqué dans le service de connexion : message « désactivé »", async () => {
    const agent = await creerAgent({ role: "officier", entite: "KAV" });
    const admin = createClient(banc.url, banc.cleService, { auth: { persistSession: false } });
    await admin.auth.admin.updateUserById(agent.id, { ban_duration: "876000h" });
    const r = await connecterAgent(client, { nom: agent.nom, motDePasse: agent.motDePasse });
    expect(r).toEqual({ ok: false, message: MESSAGES.compteDesactive });
    expect(journal(agent.nom)).toMatchObject({ succes: false, motif: "compte désactivé (bloqué)", utilisateur: agent.id });
  });

  it("compte de connexion sans profil dans le logiciel : refusé et session refermée", async () => {
    const nom = nomUnique("orphelin");
    await creerCompte(nom, "MotDePasse-2026");
    const r = await connecterAgent(client, { nom, motDePasse: "MotDePasse-2026" });
    expect(r).toEqual({ ok: false, message: MESSAGES.sansProfil });
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(journal(nom)).toMatchObject({ succes: false, motif: "compte sans profil dans le logiciel" });
  });

  it("serveur injoignable : message clair, sans plantage", async () => {
    const hors = createClient("http://127.0.0.1:9", banc.clePublique, { auth: { persistSession: false } });
    const r = await connecterAgent(hors, { nom: "mulongwe.officier", motDePasse: "MotDePasse-2026" });
    expect(r).toEqual({ ok: false, message: MESSAGES.injoignable });
  });
});

describe("Le journal reste fiable", () => {
  it("un visiteur non connecté ne peut PAS faire croire à une connexion réussie", async () => {
    const agent = await creerAgent({ role: "officier", entite: "MUL" });
    const { error } = await client.rpc("journaliser_connexion", { p_nom_utilisateur: agent.nom, p_succes: true });
    expect(error?.message).toContain("ne peut être notée que par la personne connectée");
    expect(nombreDansJournal(agent.nom)).toBe(0);
  });

  it("un agent connecté ne voit que SES connexions, et ne peut pas les effacer", async () => {
    const a = await creerAgent({ role: "officier", entite: "KAL" });
    const b = await creerAgent({ role: "caissier", entite: "KAL" });
    await connecterAgent(client, { nom: b.nom, motDePasse: "faux-mot-de-passe" });
    await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
    const { data } = await client.from("journal_connexions").select("nom_utilisateur_saisi");
    expect(data?.map((l) => l.nom_utilisateur_saisi)).toEqual([a.nom]);
    const { error } = await client.from("journal_connexions").delete().eq("nom_utilisateur_saisi", a.nom).select();
    expect(error).not.toBeNull();
    expect(nombreDansJournal(a.nom)).toBe(1);
  });
});
