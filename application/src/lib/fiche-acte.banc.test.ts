// Fichier 31 — fiche d'un acte contre le banc (vrai Supabase + vraie base, vraie caisse, migration 20)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { annulerActe, corrigerNomActe, delivrerActe, enregistrerActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { actionsPossibles, informationsActe, lireFicheActe, parcoursActe } from "./fiche-acte";
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
       delete from public.taux_change where entite_id = (select id from public.entites where code = 'KAV');`);
});

async function agent(role: "officier" | "caissier", entite: "KAV" | "KAL" = "KAV", nomComplet = "Agent d'essai") {
  const a = await creerAgent({ role, entite, nomComplet });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}

describe("Fiche d'un acte (Kavimvira)", () => {
  it("parcours complet avec les noms ; correction d'un nom avec motif ; délivré ; pas d'annulation par l'officier", async () => {
    const officier = await agent("officier", "KAV", "Amani Byamungu");
    const caissier = await agent("caissier", "KAV", "Grace Mapendo");
    const kav = (await lireEntite(officier, "KAV"))!;
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    expect((await enregistrerTaux(caissier, kav.id, "2850")).ok).toBe(true);

    const saisie: SaisieActe = {
      typeActeId: exnais.id, categorie: "national", titulaire: "Furaha Neema", titulaire2: "", demandeur: "Mugisho Pierre", telephone: "+243 990 000 000",
      observations: "", details: { sexe: "F", date_naissance: "2015-03-21", lieu_naissance: "Uvira", nom_mere: "Bahati Claire" },
    };
    const r = await enregistrerActe(officier, saisie, true, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    expect((await caissier.rpc("encaisser", { p_acte: r.acte.id, p_devise_recue: "CDF" })).error).toBeNull();

    let fiche = (await lireFicheActe(officier, r.acte.id))!;
    expect(fiche.recu).toMatchObject({ numero_recu: expect.stringMatching(/^KAV-REC-\d{4}-\d{6}$/), montant_recu: 85500, taux_applique: 2850, devise_recue: "CDF" });
    expect(parcoursActe(fiche).map((e) => [e.libelle, e.etat, e.details.join(" | ").replace(/\d{2} h \d{2}/g, "HH")])).toEqual([
      ["Enregistré", "fait", expect.stringMatching(/^\d{2}\/\d{2} · HH · Amani Byamungu$/)],
      ["Transmis au Caissier", "fait", "HH"],
      ["Payé", "fait", expect.stringMatching(/^HH · Grace Mapendo \| KAV-REC-/)],
      ["Délivré", "a-venir", ""],
      ["Scanné", "a-venir", ""],
    ]);
    expect(informationsActe(fiche).find(([l]) => l === "Montant")?.[1].replace(/[  ]/g, " ")).toBe("30 $ — payé 85 500 FC (taux 2 850)");
    expect(actionsPossibles(fiche)).toMatchObject({ corrigerNom: true, delivrer: true, annuler: false, corrigerFiche: false });

    // Correction d'un nom : motif obligatoire, puis faite et notée
    const noms = { titulaire: "NEEMA Furaha", titulaire2: "", demandeur: "Mugisho Pierre", motif: "" };
    expect(await corrigerNomActe(officier, r.acte.id, noms, false)).toMatchObject({ ok: false, champ: "motif" });
    expect(await corrigerNomActe(officier, r.acte.id, { ...noms, motif: "Carte d'électeur présentée" }, false)).toMatchObject({ ok: true });
    fiche = (await lireFicheActe(officier, r.acte.id))!;
    expect(fiche.acte).toMatchObject({ titulaire_nom: "NEEMA Furaha", motif_correction: "Carte d'électeur présentée", statut: "paye" });

    // L'officier ne peut ni annuler un acte payé, ni modifier sa fiche (la base refuse, même en direct)
    expect(await annulerActe(officier, r.acte.id, "Erreur")).toMatchObject({ ok: false, message: expect.stringContaining("le Caissier doit annuler son reçu") });
    const direct = await officier.from("actes").update({ statut: "annule", motif_annulation: "Erreur" }).eq("id", r.acte.id);
    expect(direct.error?.message).toContain("en annulant son reçu");
    const fiche2 = await officier.from("details_naissance").update({ lieu_naissance: "Bukavu" }).eq("acte_id", r.acte.id);
    expect(fiche2.error?.message).toContain("fiche de détails est figée");

    // Délivré
    expect(await delivrerActe(officier, r.acte.id)).toMatchObject({ ok: true, acte: { statut: "delivre" } });
    fiche = (await lireFicheActe(officier, r.acte.id))!;
    expect(parcoursActe(fiche)[3]).toMatchObject({ libelle: "Délivré", etat: "fait", details: [expect.stringContaining("Amani Byamungu")] });
    expect(await delivrerActe(officier, r.acte.id)).toMatchObject({ ok: false });
  });

  it("acte pas encore payé : l'officier l'annule avec motif ; une autre entité ne voit pas la fiche", async () => {
    const officier = await agent("officier");
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const r = await enregistrerActe(
      officier,
      { typeActeId: atidc.id, categorie: "national", titulaire: "Bisimwa Paul", titulaire2: "", demandeur: "", telephone: "", observations: "", details: {} },
      true,
      aujourdhuiUvira(),
    );
    if (!r.ok) throw new Error(r.message);
    expect(await annulerActe(officier, r.acte.id, " ")).toMatchObject({ ok: false, champ: "motif" });
    expect(await annulerActe(officier, r.acte.id, "Demande abandonnée")).toMatchObject({ ok: true, acte: { statut: "annule" } });
    const fiche = (await lireFicheActe(officier, r.acte.id))!;
    expect(parcoursActe(fiche).at(-1)).toMatchObject({ libelle: "Annulé", etat: "annule", details: [expect.any(String), "Motif : Demande abandonnée"] });
    expect(actionsPossibles(fiche)).toEqual({ corrigerFiche: false, transmettre: false, corrigerNom: false, delivrer: false, annuler: false, annulationParLaCaisse: false, scanner: false, refaireScan: false });

    const autre = await agent("officier", "KAL");
    expect(await lireFicheActe(autre, r.acte.id)).toBeNull();
  });
});
