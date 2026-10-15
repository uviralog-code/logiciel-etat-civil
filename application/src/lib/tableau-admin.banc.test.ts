// Tableau de bord de l'administrateur contre le banc : les 4 entités, caisse d'hier, écarts, points à vérifier
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { enregistrerActe, type SaisieActe } from "./actes";
import { cloturerJournee } from "./cloture";
import { connecterAgent } from "./connexion";
import { encaisserActe } from "./encaissement";
import { lireTypeParCode } from "./nouvel-acte";
import { lireJourneeCaisse } from "./recus-du-jour";
import { lireTableauAdmin, veille } from "./tableau-admin";
import { lireEntite } from "./tarifs-entite";
import { aujourdhuiUvira } from "./tarifs";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const client = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
async function agent(role: "officier" | "caissier", entite: "KAV" | "KAL") {
  const a = await creerAgent({ role, entite });
  const c = client();
  await connecterAgent(c, { nom: a.nom, motDePasse: a.motDePasse });
  return c;
}

describe("Tableau de bord de l'administrateur", () => {
  it("4 entités dans l'ordre ; totaux ; caisse d'hier non clôturée ; écart expliqué ; points à vérifier", async () => {
    const admin = await creerAgent({ role: "admin" });
    const a = client();
    await connecterAgent(a, { nom: admin.nom, motDePasse: admin.motDePasse });
    const debut = await commencerMiseEnPlace(a);
    if (!debut.ok) throw new Error(debut.message);
    expect((await verifierCode(a, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: admin.nom })).ok).toBe(true);

    const jour = aujourdhuiUvira();
    const hier = veille(jour);
    const officier = await agent("officier", "KAV");
    const caissier = await agent("caissier", "KAV");
    const officierKal = await agent("officier", "KAL");
    const caissierKal = await agent("caissier", "KAL");
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const payer = async (o: typeof officier, c: typeof caissier, nom: string) => {
      const s: SaisieActe = { typeActeId: atidc.id, categorie: "national", titulaire: nom, titulaire2: "", demandeur: "", telephone: "", observations: "", details: {} };
      const r = await enregistrerActe(o, s, true, jour);
      if (!r.ok) throw new Error(r.message);
      const e = await encaisserActe(c, r.acte.id, "CDF", Number(r.acte.montant_du));
      if (!e.ok) throw new Error(e.message);
      return { prix: Number(r.acte.montant_du), recu: e.recu };
    };
    const avant = await lireTableauAdmin(a, jour);
    const aujourdhuiKav = await payer(officier, caissier, "Tableau Aujourd'hui");
    // Kavimvira : un paiement d'hier, journée NON clôturée
    const hierKav = await payer(officier, caissier, "Tableau Hier");
    // Kalundu : un paiement d'hier, journée clôturée avec un écart
    const hierKal = await payer(officierKal, caissierKal, "Tableau Hier Kalundu");
    sql(`set session_replication_role = replica; update public.recus set journee = public.aujourdhui() - 1 where id in ('${hierKav.recu.id}', '${hierKal.recu.id}')`);
    const kal = (await lireEntite(caissierKal, "KAL"))!;
    const t0 = (await lireJourneeCaisse(caissierKal, kal.id, hier)).totaux;
    expect(await cloturerJournee(caissierKal, kal.id, hier, {
      compteUsd: String(t0.usd), compteCdf: String(t0.cdf - 500), explication: "Pièce de 500 FC manquante", attenduUsd: t0.usd, attenduCdf: t0.cdf,
    })).toEqual({ ok: true });

    const t = await lireTableauAdmin(a, jour);
    expect(t.entites.map((e) => [e.code, e.nomCourt])).toEqual([["MUL", "Mulongwe"], ["KAV", "Kavimvira"], ["KAL", "Kalundu"], ["BAV", "Bavira"]]);
    const kav = t.entites.find((e) => e.code === "KAV")!;
    const avantKav = avant.entites.find((e) => e.code === "KAV")!;
    expect(kav.recettesJour).toBe(avantKav.recettesJour + aujourdhuiKav.prix);
    expect(kav.caisseHier).toBe("non_cloturee");
    expect(t.entites.find((e) => e.code === "KAL")!.caisseHier).toBe("cloturee");
    expect(t.total.recettesJour).toBe(t.entites.reduce((s, e) => s + e.recettesJour, 0));
    expect(t.total.recettesMois).toBe(t.entites.reduce((s, e) => s + e.recettesMois, 0));

    // Points à vérifier : les graves d'abord (caisse non clôturée, manque)
    expect(t.points.find((p) => p.sujet === "Caisse" && p.entite === "Kavimvira")).toMatchObject({ grave: true });
    expect(t.points.find((p) => p.sujet === "Écart" && p.entite === "Kalundu")).toMatchObject({
      grave: true, texte: expect.stringContaining("Explication : « Pièce de 500 FC manquante »"),
    });
    const premierNonGrave = t.points.findIndex((p) => !p.grave);
    expect(premierNonGrave === -1 || t.points.slice(premierNonGrave).every((p) => !p.grave)).toBe(true);

    // Les autres rôles n'en voient qu'une partie (règles d'accès) : le Caissier de Kavimvira ne voit que son entité
    const vueCaissier = await lireTableauAdmin(caissier, jour);
    expect(vueCaissier.entites.map((e) => e.code)).toEqual(["KAV"]);
  });
});
