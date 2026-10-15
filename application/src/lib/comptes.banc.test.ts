// Fichier 20 — lecture de la liste des comptes contre le banc (vrai Supabase + vraie base)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent } from "./connexion";
import { lireComptes } from "./comptes";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

/** Administrateur connecté ; avec le code à 6 chiffres si `verifie`. */
async function administrateur(verifie: boolean): Promise<SupabaseClient> {
  const admin = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: admin.nom, motDePasse: admin.motDePasse });
  if (verifie) {
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    const r = await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: admin.nom });
    if (!r.ok) throw new Error(r.message);
  }
  return client;
}
const noms = (l: Awaited<ReturnType<typeof lireComptes>>) =>
  l.rangees.flatMap((r) => (r.type === "compte" ? [r.compte.nom_utilisateur] : []));

describe("Administrateur vérifié", () => {
  it("voit tous les agents, les postes à pourvoir et les anciens comptes, avec leur état", async () => {
    const officier = await creerAgent({ role: "officier", entite: "KAV", nomComplet: "Amani Byamungu" });
    const caissier = await creerAgent({ role: "caissier", entite: "KAV", nomComplet: "Grace Mapendo", doitChanger: true });
    sql(`update public.utilisateurs set derniere_connexion_en_ligne = now() - interval '6 days' where id = '${officier.id}'`);
    const ancien = await creerAgent({ role: "officier", entite: "BAV", nomComplet: "Jean Kabila" });
    await creerAgent({ role: "officier", entite: "BAV", nomComplet: "Claire Bahati" }); // remplace (désactive) l'ancien
    sql(`update public.utilisateurs set actif = false where role = 'caissier' and entite_id = (select id from public.entites where code = 'BAV') and actif`);

    const liste = await lireComptes(await administrateur(true));

    // (Les autres tests du banc ont pu laisser d'anciens comptes désactivés : on regarde les deux postes actifs)
    const kav = liste.rangees.filter((r) => r.entite.code === "KAV").slice(0, 2);
    expect(kav.map((r) => (r.type === "compte" ? [r.compte.nom_utilisateur, r.etat.libelle] : ["à créer"]))).toEqual([
      [officier.nom, "Hors-ligne : reste 1 jour"],
      [caissier.nom, "Première connexion attendue"],
    ]);
    const bav = liste.rangees.filter((r) => r.entite.code === "BAV");
    expect(bav[1]).toMatchObject({ type: "a-creer", role: "caissier" });
    const archive = bav.find((r) => r.type === "compte" && r.compte.id === ancien.id);
    expect(archive).toMatchObject({ type: "compte", compte: { actif: false, nom_utilisateur: expect.stringMatching(/\.ancien\d{8}/) } });
    expect(archive?.type === "compte" && archive.etat.libelle).toMatch(/^Désactivé le \d{2}\/\d{2}$/);
    expect(liste.rangees.map((r) => r.entite.code).filter((c, i, t) => t.indexOf(c) === i)).toEqual(["MUL", "KAV", "KAL", "BAV"]);
  });
});

describe("Personne d'autre ne voit la liste (la base l'impose)", () => {
  it("administrateur SANS le code à 6 chiffres : liste vide", async () => {
    await creerAgent({ role: "officier", entite: "MUL" });
    const liste = await lireComptes(await administrateur(false));
    expect(liste.rangees).toEqual([]);
  });

  it("officier : ne voit que son propre compte, jamais ceux des autres", async () => {
    const autre = await creerAgent({ role: "caissier", entite: "KAL" });
    const moi = await creerAgent({ role: "officier", entite: "KAL" });
    const client = nouveauClient();
    await connecterAgent(client, { nom: moi.nom, motDePasse: moi.motDePasse });
    const liste = await lireComptes(client);
    expect(noms(liste)).toEqual([moi.nom]);
    expect(noms(liste)).not.toContain(autre.nom);
  });
});
