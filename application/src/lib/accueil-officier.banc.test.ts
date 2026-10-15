// Fichier 30 — accueil de l'officier contre le banc (vrai Supabase + vraie base, vraie caisse)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { lireAccueilOfficier } from "./accueil-officier";
import { corrigerActe, enregistrerActe, lireActe, saisieDepuisActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { lireTypeParCode } from "./nouvel-acte";
import { enregistrerTaux } from "./taux";
import { lireEntite } from "./tarifs-entite";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
afterAll(() => {
  sql(`set session_replication_role = replica;
       delete from public.taux_change where entite_id = (select id from public.entites where code = 'BAV');`);
});

async function agent(role: "officier" | "caissier", entite: "BAV" | "KAV" = "BAV") {
  const a = await creerAgent({ role, entite });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const saisie = (typeActeId: string, titulaire: string, s: Partial<SaisieActe> = {}): SaisieActe => ({
  typeActeId, categorie: "national", titulaire, titulaire2: "", demandeur: "", telephone: "", observations: "", details: {}, ...s,
});

describe("Accueil de l'officier (Bavira)", () => {
  it("compteurs, à scanner (oubli d'hier en premier), renvoyés avec motif, derniers actes ; puis correction", async () => {
    const officier = await agent("officier");
    const caissier = await agent("caissier");
    const bav = (await lireEntite(officier, "BAV"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    const jour = aujourdhuiUvira();
    expect((await enregistrerTaux(caissier, bav.id, "2850")).ok).toBe(true);

    const nouvel = async (s: SaisieActe, transmettre: boolean) => {
      const r = await enregistrerActe(officier, s, transmettre, jour);
      if (!r.ok) throw new Error(r.message);
      return r.acte;
    };
    const paye = await nouvel(saisie(exnais.id, "Kahindo Aline", { details: { sexe: "F", date_naissance: "2020-02-02" } }), true);
    const renvoye = await nouvel(saisie(atidc.id, "Furaha Neema"), true);
    const brouillon = await nouvel(saisie(atidc.id, "Bisimwa Paul"), false);
    const enAttente = await nouvel(saisie(atidc.id, "Amani Jean", { categorie: "etranger" }), true);
    const oubli = await nouvel(saisie(atidc.id, "Mapendo Grace"), true);

    // La vraie caisse : encaissements et renvoi
    for (const a of [paye, oubli]) expect((await caissier.rpc("encaisser", { p_acte: a.id })).error).toBeNull();
    expect((await caissier.rpc("renvoyer_a_l_officier", { p_acte: renvoye.id, p_motif: "Le demandeur dit s'appeler NEEMA Furaha" })).error).toBeNull();
    // L'oubli date d'hier (journée de caisse déplacée en maintenance)
    sql(`set session_replication_role = replica; update public.recus set journee = public.aujourdhui() - 1 where acte_id = '${oubli.id}'`);

    const accueil = await lireAccueilOfficier(officier, bav.id, jour);
    const mesIds = new Set([paye, renvoye, brouillon, enAttente, oubli].map((a) => a.id));
    expect(accueil.compteurs).toMatchObject({ enregistres: 5, enAttente: 1, renvoyes: 1, aScanner: 2 });
    expect(accueil.aScanner.map((a) => [a.identifiant, a.enRetard, a.payeLe != null])).toEqual([
      [oubli.identifiant, true, true],
      [paye.identifiant, false, true],
    ]);
    expect(accueil.aScanner[1]).toMatchObject({ type: { code: "EXNAIS" }, titulaire: "Kahindo Aline", journee: jour });
    expect(accueil.renvoyes).toEqual([
      {
        id: renvoye.id, identifiant: renvoye.identifiant, titulaire: "Furaha Neema", renvoyeLe: expect.any(String),
        par: "Agent d'essai", motif: "Le demandeur dit s'appeler NEEMA Furaha",
      },
    ]);
    expect(accueil.derniers.filter((a) => mesIds.has(a.id)).map((a) => [a.identifiant, a.statut])).toEqual([
      [oubli.identifiant, "paye"],
      [enAttente.identifiant, "en_attente_paiement"],
      [brouillon.identifiant, "enregistre"],
      [renvoye.identifiant, "enregistre"],
      [paye.identifiant, "paye"],
    ]);

    // Correction de l'acte renvoyé : il repart chez le Caissier, le motif disparaît
    const acte = (await lireActe(officier, renvoye.id))!;
    const c = await corrigerActe(officier, acte.id, { ...saisieDepuisActe(acte), titulaire: "NEEMA Furaha" }, true, jour);
    expect(c).toMatchObject({ ok: true, acte: { identifiant: renvoye.identifiant, statut: "en_attente_paiement" } });
    const apres = await lireAccueilOfficier(officier, bav.id, jour);
    expect(apres.compteurs).toMatchObject({ enAttente: 2, renvoyes: 0 });
  });

  it("un officier d'une autre entité ne voit rien de Bavira", async () => {
    const kav = await agent("officier", "KAV");
    const bav = sql(`select id from public.entites where code = 'BAV'`);
    const accueil = await lireAccueilOfficier(kav, bav, aujourdhuiUvira());
    expect(accueil).toEqual({ compteurs: { enregistres: 0, enAttente: 0, renvoyes: 0, aScanner: 0 }, aScanner: [], renvoyes: [], derniers: [] });
  });
});
