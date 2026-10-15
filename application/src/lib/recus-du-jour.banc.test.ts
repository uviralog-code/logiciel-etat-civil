// Fichier 40 — reçus du jour contre le banc : liste, totaux, annulation (remise en file ou acte annulé)
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent } from "@/test/banc";
import { lireAccueilCaissier } from "./accueil-caissier";
import { enregistrerActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { encaisserActe, exonererActe, MOTIFS_EXONERATION } from "./encaissement";
import { lireFicheActe } from "./fiche-acte";
import { lireTypeParCode } from "./nouvel-acte";
import { annulerRecu, lireJourneeCaisse } from "./recus-du-jour";
import { lireEntite } from "./tarifs-entite";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
async function agent(role: "officier" | "caissier") {
  const a = await creerAgent({ role, entite: "MUL", nomComplet: role === "caissier" ? "Neema Furaha" : "Bahati Mugisho" });
  const c = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(c, { nom: a.nom, motDePasse: a.motDePasse });
  return c;
}

describe("Reçus du jour (Mulongwe)", () => {
  it("liste et totaux ; erreur de caisse : l'acte revient et se repaie ; erreur sur l'acte : l'acte est annulé", async () => {
    const officier = await agent("officier");
    const caissier = await agent("caissier");
    const mul = (await lireEntite(caissier, "MUL"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const jour = aujourdhuiUvira();
    const avant = await lireJourneeCaisse(caissier, mul.id, jour);
    const nouvelPaye = async (nom: string) => {
      const s: SaisieActe = { typeActeId: atidc.id, categorie: "national", titulaire: nom, titulaire2: "", demandeur: "", telephone: "", observations: "", details: {} };
      const r = await enregistrerActe(officier, s, true, jour);
      if (!r.ok) throw new Error(r.message);
      return r.acte;
    };
    const a = await nouvelPaye("Erreur Caisse");
    const b = await nouvelPaye("Erreur Acte");
    const g = await nouvelPaye("Gratuit Total");
    const prix = Number(a.montant_du);
    const ra = await encaisserActe(caissier, a.id, "CDF", prix);
    const rb = await encaisserActe(caissier, b.id, "CDF", prix);
    if (!ra.ok || !rb.ok) throw new Error("encaissement");
    expect(await exonererActe(caissier, g.id, MOTIFS_EXONERATION[1], "décision n° 12/2026")).toEqual({ ok: true });

    // 1. Erreur de caisse : reçu annulé, l'acte revient dans la file, puis nouveau reçu
    expect(await annulerRecu(caissier, ra.recu.id, "  L'usager voulait payer en dollars ", "remettre")).toEqual({
      ok: true, numero: ra.recu.numero, remis: true, acte: a.identifiant,
    });
    expect((await lireAccueilCaissier(caissier, mul.id, jour)).aEncaisser.some((x) => x.id === a.id)).toBe(true);
    const ra2 = await encaisserActe(caissier, a.id, "CDF", prix);
    if (!ra2.ok) throw new Error(ra2.message);
    expect(ra2.recu.numero).not.toBe(ra.recu.numero);
    // La fiche de l'acte montre le reçu valide (le plus récent)
    expect((await lireFicheActe(caissier, a.id))!.recu).toMatchObject({ numero_recu: ra2.recu.numero, statut: "valide" });

    // 2. Erreur sur l'acte : l'acte est annulé ; plus d'annulation possible du même reçu
    expect(await annulerRecu(caissier, rb.recu.id, "Mauvais type d'acte", "annuler-acte")).toMatchObject({ ok: true, remis: false });
    expect((await lireFicheActe(caissier, b.id))!.acte.statut).toBe("annule");
    expect(await annulerRecu(caissier, rb.recu.id, "Encore", "annuler-acte")).toMatchObject({ ok: false, message: expect.stringContaining("déjà annulé") });
    // L'Officier n'annule pas de reçu
    expect((await annulerRecu(officier, ra2.recu.id, "Essai", "annuler-acte")).ok).toBe(false);

    // 3. La journée : reçus (les plus récents d'abord), exonération, totaux
    const apres = await lireJourneeCaisse(caissier, mul.id, jour);
    const mesRecus = apres.recus.filter((r) => [a.id, b.id].includes(r.acte.id));
    expect(mesRecus.map((r) => [r.numero, r.statut, r.suiteAnnulation])).toEqual([
      [ra2.recu.numero, "valide", null],
      [rb.recu.numero, "annule", "acte_annule"],
      [ra.recu.numero, "annule", "acte_remis_en_file"],
    ]);
    expect(mesRecus[2]).toMatchObject({ motifAnnulation: "L'usager voulait payer en dollars", acte: { identifiant: a.identifiant, titulaire: "Erreur Caisse", statut: "paye" } });
    expect(apres.exonerations.find((x) => x.acte.id === g.id)).toMatchObject({ motif: "Décision de l'autorité locale — décision n° 12/2026", devise: "CDF", montant: prix });
    expect(apres.totaux).toMatchObject({
      cdf: avant.totaux.cdf + prix, valides: avant.totaux.valides + 1, annules: avant.totaux.annules + 2,
      exonerations: avant.totaux.exonerations + 1, exonereCdf: avant.totaux.exonereCdf + prix,
    });
    expect(apres.clotureLe).toBeNull();
  });
});
