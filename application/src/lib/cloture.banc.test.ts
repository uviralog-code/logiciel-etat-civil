// Fichier 41 — clôture contre le banc (journée d'HIER, pour ne pas verrouiller aujourd'hui les autres tests)
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe, type SaisieActe } from "./actes";
import { cloturerJournee, lireActesSansScan, lireClotureFaite, MESSAGES_CLOTURE } from "./cloture";
import { connecterAgent } from "./connexion";
import { encaisserActe } from "./encaissement";
import { lireTypeParCode } from "./nouvel-acte";
import { annulerRecu, lireJourneeCaisse } from "./recus-du-jour";
import { lireEntite } from "./tarifs-entite";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
async function agent(role: "officier" | "caissier", nomComplet: string) {
  const a = await creerAgent({ role, entite: "MUL", nomComplet });
  const c = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(c, { nom: a.nom, motDePasse: a.motDePasse });
  return c;
}

describe("Clôture de caisse (Mulongwe, journée d'hier)", () => {
  it("attendus vérifiés ; écart expliqué ; actes sans scan ; journée verrouillée", async () => {
    const officier = await agent("officier", "Bahati Mugisho");
    const caissier = await agent("caissier", "Neema Furaha");
    const mul = (await lireEntite(caissier, "MUL"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const jour = aujourdhuiUvira();
    const hier = sql(`select (public.aujourdhui() - 1)::text`);
    const nouveau = async (nom: string) => {
      const s: SaisieActe = { typeActeId: atidc.id, categorie: "national", titulaire: nom, titulaire2: "", demandeur: "", telephone: "", observations: "", details: {} };
      const r = await enregistrerActe(officier, s, true, jour);
      if (!r.ok) throw new Error(r.message);
      const e = await encaisserActe(caissier, r.acte.id, "CDF", Number(r.acte.montant_du));
      if (!e.ok) throw new Error(e.message);
      return { acte: r.acte, recu: e.recu };
    };
    const a = await nouveau("Clôture Un");
    const b = await nouveau("Clôture Deux");
    // Les deux reçus passent sur la journée d'hier (maintenance), pas encore clôturée
    sql(`set session_replication_role = replica; update public.recus set journee = public.aujourdhui() - 1 where id in ('${a.recu.id}', '${b.recu.id}')`);
    const prix = Number(a.acte.montant_du);
    const journee = await lireJourneeCaisse(caissier, mul.id, hier);
    const attenduCdf = journee.totaux.cdf;
    expect(attenduCdf).toBeGreaterThanOrEqual(2 * prix);
    expect((await lireActesSansScan(caissier, mul.id, hier)).map((x) => x.identifiant)).toEqual(expect.arrayContaining([a.acte.identifiant, b.acte.identifiant]));

    const saisie = { compteUsd: "0", compteCdf: String(attenduCdf - 1000), explication: "", attenduUsd: journee.totaux.usd, attenduCdf };
    // Écart sans explication : refusé avant la base
    expect(await cloturerJournee(caissier, mul.id, hier, saisie)).toMatchObject({ ok: false, champ: "explication" });
    // Attendus annoncés dépassés (un reçu de plus pendant le comptage) : rien n'est clôturé
    expect(await cloturerJournee(caissier, mul.id, hier, { ...saisie, attenduCdf: attenduCdf - prix, explication: "Billet rendu" })).toEqual({
      ok: false, message: MESSAGES_CLOTURE.attenduChange,
    });
    expect(await lireClotureFaite(caissier, mul.id, hier)).toBeNull();
    // L'Officier ne clôture pas
    expect((await cloturerJournee(officier, mul.id, hier, { ...saisie, explication: "Billet rendu" })).ok).toBe(false);

    expect(await cloturerJournee(caissier, mul.id, hier, { ...saisie, explication: "  Billet de 1 000 FC rendu par erreur " })).toEqual({ ok: true });
    expect(await lireClotureFaite(caissier, mul.id, hier)).toMatchObject({
      par: "Neema Furaha", attenduCdf, compteCdf: attenduCdf - 1000, ecartCdf: -1000, ecartUsd: 0, explication: "Billet de 1 000 FC rendu par erreur",
    });

    // Verrouillée : pas de seconde clôture, pas d'annulation de reçu de ce jour-là
    expect(await cloturerJournee(caissier, mul.id, hier, { ...saisie, explication: "Encore" })).toEqual({ ok: false, message: MESSAGES_CLOTURE.dejaCloturee });
    expect(await annulerRecu(caissier, a.recu.id, "Trop tard", "annuler-acte")).toMatchObject({ ok: false, message: expect.stringContaining("est clôturée") });
    // Aujourd'hui reste ouvert
    expect(await lireClotureFaite(caissier, mul.id, jour)).toBeNull();
  });
});
