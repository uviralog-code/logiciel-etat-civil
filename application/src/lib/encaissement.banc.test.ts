// Fichier 38 — encaissement contre le banc (vrai Supabase + vraie base, migration 24)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { encaisserActe, exonererActe, lireCloture, lireTauxApplicable, montantAPercevoir, MOTIFS_EXONERATION } from "./encaissement";
import { lireTypeParCode } from "./nouvel-acte";
import { lireRecu } from "./recus";
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

async function agent(role: "officier" | "caissier", nomComplet: string) {
  const a = await creerAgent({ role, entite: "MUL", nomComplet });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const saisie = (typeActeId: string, titulaire: string, details: Record<string, string> = {}): SaisieActe => ({
  typeActeId, categorie: "national", titulaire, titulaire2: "", demandeur: "Mapendo Joseph", telephone: "", observations: "", details,
});

describe("Encaissement (Mulongwe)", () => {
  it("acte figé pour l'Officier ; montant annoncé vérifié ; $ payé en FC arrondi ; FC payé en $ refusé ; exonération motivée", async () => {
    const officier = await agent("officier", "Bahati Mugisho");
    const caissier = await agent("caissier", "Neema Furaha");
    const mul = (await lireEntite(caissier, "MUL"))!;
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const jour = aujourdhuiUvira();
    const nouvel = async (s: SaisieActe) => {
      const r = await enregistrerActe(officier, s, true, jour);
      if (!r.ok) throw new Error(r.message);
      return r.acte;
    };
    const naissance = await nouvel(saisie(exnais.id, "Mapendo Grace", { sexe: "F", date_naissance: "2020-02-02" }));
    const attestation = await nouvel(saisie(atidc.id, "Furaha Neema"));
    const gratuit = await nouvel(saisie(atidc.id, "Indigent Paul"));

    // 1. L'Officier ne touche plus à un acte transmis (le prix ne bouge plus)
    const modif = await officier.from("actes").update({ categorie: "etranger" }).eq("id", attestation.id).select("id");
    expect(modif.error?.message).toContain("Cet acte est chez le Caissier");

    // 2. Pas de taux : rien en dollars. Puis taux 2 873 : 30 $ × 2 873 = 86 190 → 86 200 FC
    expect(await lireTauxApplicable(caissier, mul.id)).toBeNull();
    expect(montantAPercevoir({ montant: 30, devise: "USD" }, "CDF", null).ok).toBe(false);
    expect((await enregistrerTaux(caissier, mul.id, "2873")).ok).toBe(true);
    const taux = await lireTauxApplicable(caissier, mul.id);
    expect(taux).toBe(2873);
    const annonce = montantAPercevoir({ montant: Number(naissance.montant_du), devise: "USD" }, "CDF", taux);
    expect(annonce).toMatchObject({ ok: true, montant: 86200, devise: "CDF" });

    // Montant annoncé faux (ancien taux) : refusé, rien n'est encaissé
    const faux = await encaisserActe(caissier, naissance.id, "CDF", 85500);
    expect(faux).toMatchObject({ ok: false, message: expect.stringContaining("86 200 FC au lieu de 85 500 FC") });
    expect(sql(`select statut from public.actes where id = '${naissance.id}'`)).toBe("en_attente_paiement");

    const bon = await encaisserActe(caissier, naissance.id, "CDF", annonce.ok ? annonce.montant : 0);
    if (!bon.ok) throw new Error(bon.message);
    expect(bon.recu.numero).toMatch(/^MUL-REC-\d{4}-\d{6}$/);
    expect(await lireRecu(caissier, bon.recu.id)).toMatchObject({
      numero: bon.recu.numero, statut: "valide", montantDu: 30, deviseDu: "USD", montantRecu: 86200, deviseRecue: "CDF",
      tauxApplique: 2873, equivalentCdf: 86200, caissier: "Neema Furaha", journee: jour,
      acte: { identifiant: naissance.identifiant, titulaire: "Mapendo Grace", demandeur: "Mapendo Joseph", typeLibelle: exnais.libelle },
    });
    // Déjà payé : un second encaissement est refusé
    expect(await encaisserActe(caissier, naissance.id, "CDF", 86200)).toMatchObject({ ok: false, message: expect.stringContaining("en attente de paiement") });

    // 3. Acte en francs : en dollars, refusé ; en francs, payé sans taux sur le reçu
    expect(await encaisserActe(caissier, attestation.id, "USD", 3)).toEqual({ ok: false, message: "Cet acte est au tarif en francs : il se paie en francs congolais." });
    const fc = await encaisserActe(caissier, attestation.id, "CDF", Number(attestation.montant_du));
    if (!fc.ok) throw new Error(fc.message);
    expect(await lireRecu(caissier, fc.recu.id)).toMatchObject({ montantRecu: Number(attestation.montant_du), deviseRecue: "CDF", tauxApplique: null });

    // 4. Exonération : précision obligatoire, motif composé enregistré
    expect(await exonererActe(caissier, gratuit.id, MOTIFS_EXONERATION[0], "")).toMatchObject({ ok: false, champ: "precision" });
    expect(await exonererActe(caissier, gratuit.id, MOTIFS_EXONERATION[0], "attestation n° 045/2026")).toEqual({ ok: true });
    expect(sql(`select a.statut || ' | ' || x.motif from public.actes a join public.exonerations x on x.acte_id = a.id where a.id = '${gratuit.id}'`)).toBe(
      "exonere | Indigent (attestation d'indigence) — attestation n° 045/2026",
    );

    // L'Officier ne peut ni encaisser ni exonérer ; la journée n'est pas clôturée
    expect((await encaisserActe(officier, gratuit.id, "CDF", 8000)).ok).toBe(false);
    expect(await lireCloture(caissier, mul.id, jour)).toBeNull();
  });
});
