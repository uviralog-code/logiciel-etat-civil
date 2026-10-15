// Fichier 37 — accueil du caissier contre le banc (vrai Supabase + vraie base, vraie caisse)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { lireAccueilCaissier, MESSAGES_RENVOI, renvoyerActe } from "./accueil-caissier";
import { lireAccueilOfficier } from "./accueil-officier";
import { enregistrerActe, type SaisieActe } from "./actes";
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
       delete from public.taux_change where entite_id = (select id from public.entites where code = 'MUL');`);
});

async function agent(role: "officier" | "caissier", entite: "MUL" | "KAV" = "MUL", nomComplet?: string) {
  const a = await creerAgent({ role, entite, nomComplet });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return { client, nom: nomComplet ?? "Agent d'essai" };
}
const saisie = (typeActeId: string, titulaire: string, demandeur = "", details: Record<string, string> = {}): SaisieActe => ({
  typeActeId, categorie: "national", titulaire, titulaire2: "", demandeur, telephone: "", observations: "", details,
});

describe("Accueil du caissier (Mulongwe)", () => {
  it("file dans l'ordre de transmission, chiffres du jour, derniers reçus, renvoi avec motif lu par l'Officier", async () => {
    const { client: officier } = await agent("officier");
    const { client: caissier, nom: nomCaissier } = await agent("caissier", "MUL", "Neema Furaha");
    const { client: autreCaissier } = await agent("caissier", "KAV");
    const mul = (await lireEntite(caissier, "MUL"))!;
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    const atres = (await lireTypeParCode(officier, "ATRES"))!;
    const jour = aujourdhuiUvira();
    expect((await enregistrerTaux(caissier, mul.id, "2850")).ok).toBe(true);
    const avant = await lireAccueilCaissier(caissier, mul.id, jour);

    // L'Officier transmet trois actes, l'un après l'autre ; un quatrième reste chez lui
    const transmettre = async (type: string, nom: string, demandeur = "", details: Record<string, string> = {}) => {
      const r = await enregistrerActe(officier, saisie(type, nom, demandeur, details), true, jour);
      if (!r.ok) throw new Error(r.message);
      return r.acte;
    };
    const a = await transmettre(exnais.id, "Mapendo Grace", "Mapendo Joseph", { sexe: "F", date_naissance: "2020-02-02" });
    const b = await transmettre(atres.id, "Byamungu Amani");
    const c = await transmettre(atres.id, "Kabila Ndoole");
    const brouillon = await enregistrerActe(officier, saisie(atres.id, "Pas encore transmis"), false, jour);
    if (!brouillon.ok) throw new Error(brouillon.message);

    const accueil = await lireAccueilCaissier(caissier, mul.id, jour);
    const miens = accueil.aEncaisser.filter((x) => [a.id, b.id, c.id].includes(x.id));
    expect(miens.map((x) => x.identifiant)).toEqual([a.identifiant, b.identifiant, c.identifiant]);
    expect(miens[0]).toMatchObject({ titulaire: "Mapendo Grace", demandeur: "Mapendo Joseph", devise: "USD", categorie: "national", type: { code: "EXNAIS" } });
    expect(miens[0].montant).toBe(Number(a.montant_du));
    expect(miens[1]).toMatchObject({ devise: "CDF", type: { code: "ATRES" } });
    expect(miens.every((x) => x.transmisLe && aujourdhuiUvira(new Date(x.transmisLe)) === jour)).toBe(true);
    expect(accueil.aEncaisser.some((x) => x.id === brouillon.acte.id)).toBe(false);
    expect(accueil.clotureLe).toBeNull();

    // Encaisser A en francs (le fichier 38 fera l'écran) : chiffres et derniers reçus
    const recu = await caissier.rpc("encaisser", { p_acte: a.id, p_devise_recue: "CDF" }).single<{ id: string; numero_recu: string; montant_recu: number }>();
    expect(recu.error).toBeNull();
    const montantFc = Number(a.montant_du) * 2850;
    const apres = await lireAccueilCaissier(caissier, mul.id, jour);
    expect(apres.chiffres).toMatchObject({
      cdf: avant.chiffres.cdf + montantFc,
      usd: avant.chiffres.usd,
      equivalentCdf: avant.chiffres.equivalentCdf + montantFc,
      recusEmis: avant.chiffres.recusEmis + 1,
      recusAnnules: avant.chiffres.recusAnnules,
    });
    expect(apres.aEncaisser.some((x) => x.id === a.id)).toBe(false);
    expect(apres.derniersRecus[0]).toMatchObject({ numero: recu.data!.numero_recu, acteIdentifiant: a.identifiant, montant: montantFc, devise: "CDF", statut: "valide" });

    // Reçu annulé : barré, avec son motif ; compté « dont 1 annulé », plus dans les recettes
    expect((await caissier.rpc("annuler_recu", { p_recu: recu.data!.id, p_motif: "erreur de type" })).error).toBeNull();
    const annule = await lireAccueilCaissier(caissier, mul.id, jour);
    expect(annule.derniersRecus[0]).toMatchObject({ numero: recu.data!.numero_recu, statut: "annule", motifAnnulation: "erreur de type" });
    expect(annule.chiffres).toMatchObject({ cdf: avant.chiffres.cdf, recusEmis: avant.chiffres.recusEmis + 1, recusAnnules: avant.chiffres.recusAnnules + 1 });

    // Renvoi de B : il quitte la file ; l'Officier le voit avec le motif et le nom du Caissier
    expect(await renvoyerActe(caissier, b.id, "Nom mal orthographié", "  Byamungu  s'écrit avec un y ")).toEqual({ ok: true, identifiant: b.identifiant });
    expect((await lireAccueilCaissier(caissier, mul.id, jour)).aEncaisser.some((x) => x.id === b.id)).toBe(false);
    const cote = await lireAccueilOfficier(officier, mul.id, jour);
    expect(cote.renvoyes.find((r) => r.id === b.id)).toMatchObject({ motif: "Nom mal orthographié — Byamungu s'écrit avec un y", par: nomCaissier });

    // Déjà renvoyé (autre ordinateur) : message clair ; « Autre motif » sans texte : refusé avant la base
    expect(await renvoyerActe(caissier, b.id, "Erreur de date", "")).toEqual({ ok: false, message: MESSAGES_RENVOI.plusEnAttente });
    expect(await renvoyerActe(caissier, c.id, "Autre motif", "")).toMatchObject({ ok: false, champ: "precision" });

    // Un caissier d'une autre entité ne voit ni ne renvoie les actes de Mulongwe
    expect(await renvoyerActe(autreCaissier, c.id, "Erreur de date", "")).toEqual({ ok: false, message: "Acte introuvable." });
    expect((await lireAccueilCaissier(autreCaissier, mul.id, jour)).aEncaisser).toEqual([]);
    expect((await lireAccueilCaissier(caissier, mul.id, jour)).aEncaisser.some((x) => x.id === c.id)).toBe(true);
  });
});
