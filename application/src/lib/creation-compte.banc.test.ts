// Fichier 21 — création d'un compte contre le banc (vrai Supabase Auth + vraie base)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, nomUnique, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent } from "./connexion";
import { creerCompteAgent, MESSAGES_CREATION } from "./creation-compte";
import { adresseInterne } from "./identifiants";
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
/** Libère le poste (désactive l'agent actif éventuel) pour pouvoir y créer un compte. */
const libererPoste = (code: string, role: string) =>
  sql(`update public.utilisateurs set actif = false where role = '${role}' and actif
         and entite_id = (select id from public.entites where code = '${code}')`);
const comptesDeConnexion = (nom: string) => Number(sql(`select count(*) from auth.users where email = '${adresseInterne(nom)}'`));

describe("Création réussie", () => {
  it("compte de connexion + profil ; mot de passe provisoire à changer ; noté au journal au nom de l'admin", async () => {
    const { admin, client } = await administrateur();
    libererPoste("BAV", "caissier");
    const nom = nomUnique("bavira");
    const r = await creerCompteAgent(client, service, { entite: "BAV", role: "caissier", nomComplet: "  Mukeba   Esther ", nomUtilisateur: nom });

    expect(r).toMatchObject({ ok: true, nomUtilisateur: nom, nomComplet: "Mukeba Esther", entite: "Chefferie des Bavira", role: "caissier" });
    if (!r.ok) return;
    expect(r.motDePasse).toMatch(/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);

    const profil = sql(`select u.role || '|' || e.code || '|' || u.actif || '|' || u.doit_changer_mot_de_passe || '|' || u.double_verification
                          from public.utilisateurs u join public.entites e on e.id = u.entite_id where u.nom_utilisateur = '${nom}'`);
    expect(profil).toBe("caissier|BAV|true|true|false");
    expect(sql(`select count(*) from public.mots_de_passe_provisoires p join public.utilisateurs u on u.id = p.utilisateur_id where u.nom_utilisateur = '${nom}'`)).toBe("1");
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'utilisateurs' and operation = 'INSERT' and reference = '${nom}' and utilisateur_id = '${admin.id}'`)).toBe("1");

    // L'agent peut se connecter avec le mot de passe provisoire… et doit le changer
    expect(await connecterAgent(nouveauClient(), { nom, motDePasse: r.motDePasse })).toMatchObject({ ok: true, destination: "/mot-de-passe" });
  });

  it("nom repris d'un ancien agent désactivé : son compte de connexion reçoit le nom d'archive, le nom habituel est libéré", async () => {
    const { client } = await administrateur();
    const nom = nomUnique("kalundu");
    const ancien = await creerAgent({ role: "caissier", entite: "KAL", nom });
    libererPoste("KAL", "caissier"); // désactivation : le profil devient « nom.ancienAAAAMMJJ » (fichier 13)
    const archive = sql(`select nom_utilisateur from public.utilisateurs where id = '${ancien.id}'`);
    expect(archive).toMatch(new RegExp(`^${nom.replace(".", "\\.")}\\.ancien\\d{8}$`));
    expect(sql(`select email from auth.users where id = '${ancien.id}'`)).toBe(adresseInterne(nom)); // encore l'ancien nom

    const r = await creerCompteAgent(client, service, { entite: "KAL", role: "caissier", nomComplet: "Nouvelle caissière", nomUtilisateur: nom });

    expect(r).toMatchObject({ ok: true, nomUtilisateur: nom });
    expect(sql(`select email from auth.users where id = '${ancien.id}'`)).toBe(adresseInterne(archive));
    // L'ancien agent ne peut plus entrer avec le nom habituel : ce nom mène désormais au nouveau compte
    expect(await connecterAgent(nouveauClient(), { nom, motDePasse: ancien.motDePasse })).toMatchObject({ ok: false });
  });

  it("deux créations donnent deux mots de passe différents", async () => {
    const { client } = await administrateur();
    libererPoste("MUL", "officier");
    libererPoste("MUL", "caissier");
    const a = await creerCompteAgent(client, service, { entite: "MUL", role: "officier", nomComplet: "Agent A", nomUtilisateur: nomUnique("a") });
    const b = await creerCompteAgent(client, service, { entite: "MUL", role: "caissier", nomComplet: "Agent B", nomUtilisateur: nomUnique("b") });
    expect(a.ok && b.ok && a.motDePasse !== b.motDePasse).toBe(true);
  });
});

describe("Créations refusées : rien n'est créé", () => {
  it("poste déjà occupé par un agent actif", async () => {
    const { client } = await administrateur();
    await creerAgent({ role: "officier", entite: "KAL" });
    const nom = nomUnique("kalundu");
    expect(await creerCompteAgent(client, service, { entite: "KAL", role: "officier", nomComplet: "Doublon", nomUtilisateur: nom })).toEqual({
      ok: false, message: MESSAGES_CREATION.posteOccupe, champ: "role",
    });
    expect(comptesDeConnexion(nom)).toBe(0);
  });

  it("nom d'utilisateur déjà pris", async () => {
    const { client } = await administrateur();
    const existant = await creerAgent({ role: "officier", entite: "KAV" });
    libererPoste("KAV", "caissier");
    expect(await creerCompteAgent(client, service, { entite: "KAV", role: "caissier", nomComplet: "Homonyme", nomUtilisateur: existant.nom })).toEqual({
      ok: false, message: MESSAGES_CREATION.nomPris, champ: "nomUtilisateur",
    });
  });

  it.each([
    [{ nomComplet: "Al" }, "nomComplet"],
    [{ nomUtilisateur: "Bavira Caissier" }, "nomUtilisateur"],
    [{ nomUtilisateur: "bavira.caissière" }, "nomUtilisateur"],
    [{ role: "admin" }, "role"],
    [{ entite: "XXX" }, "entite"],
  ])("saisie invalide %o → champ %s signalé", async (modif, champ) => {
    const { client } = await administrateur();
    const r = await creerCompteAgent(client, service, { entite: "BAV", role: "caissier", nomComplet: "Mukeba Esther", nomUtilisateur: nomUnique("ok"), ...modif });
    expect(r).toMatchObject({ ok: false, champ });
  });

  it("administrateur sans le code à 6 chiffres : la base ne lui montre rien, rien n'est créé", async () => {
    const { client } = await administrateur(false);
    const nom = nomUnique("intrus");
    const r = await creerCompteAgent(client, service, { entite: "BAV", role: "caissier", nomComplet: "Intrus", nomUtilisateur: nom });
    expect(r.ok).toBe(false);
    expect(comptesDeConnexion(nom)).toBe(0);
  });

  it("si la base refuse le profil, le compte de connexion déjà créé est supprimé (rien à moitié fait)", async () => {
    // Un officier n'a pas le droit de créer de profil : la base refuse au dernier moment
    const officier = await creerAgent({ role: "officier", entite: "BAV" });
    libererPoste("BAV", "caissier");
    const client = nouveauClient();
    await connecterAgent(client, { nom: officier.nom, motDePasse: officier.motDePasse });
    const nom = nomUnique("bavira");
    expect(await creerCompteAgent(client, service, { entite: "BAV", role: "caissier", nomComplet: "Par un officier", nomUtilisateur: nom })).toEqual({
      ok: false, message: MESSAGES_CREATION.refus,
    });
    expect(comptesDeConnexion(nom)).toBe(0);
    expect(sql(`select count(*) from public.utilisateurs where nom_utilisateur = '${nom}'`)).toBe("0");
  });

  it("deux créations en même temps pour le même poste : une seule réussit, l'autre est annulée proprement", async () => {
    const { client } = await administrateur();
    libererPoste("KAL", "caissier");
    const [n1, n2] = [nomUnique("x"), nomUnique("y")];
    const resultats = await Promise.all([
      creerCompteAgent(client, service, { entite: "KAL", role: "caissier", nomComplet: "Premier", nomUtilisateur: n1 }),
      creerCompteAgent(client, service, { entite: "KAL", role: "caissier", nomComplet: "Second", nomUtilisateur: n2 }),
    ]);
    expect(resultats.filter((r) => r.ok)).toHaveLength(1);
    expect(resultats.find((r) => !r.ok)).toMatchObject({ message: MESSAGES_CREATION.posteOccupe });
    expect(comptesDeConnexion(n1) + comptesDeConnexion(n2)).toBe(1);
  });
});
