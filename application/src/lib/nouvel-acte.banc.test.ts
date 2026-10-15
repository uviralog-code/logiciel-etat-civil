// Fichier 29 — « Nouvel acte » contre le banc (vrai Supabase + vraie base)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe, lireActe, transmettreActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { idPrevu, lireDernierNumero, lireTypeParCode } from "./nouvel-acte";
import { lireEntite } from "./tarifs-entite";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
afterAll(() => {
  sql(`set session_replication_role = replica; update public.types_actes set actif = true where code = 'ATLOG';`);
});

async function agent(role: "officier" | "caissier") {
  const a = await creerAgent({ role, entite: "KAL" });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const saisie = (typeActeId: string, s: Partial<SaisieActe> = {}): SaisieActe => ({
  typeActeId, categorie: "national", titulaire: "Furaha Neema", titulaire2: "", demandeur: "", telephone: "", observations: "", details: {}, ...s,
});

describe("ID prévu = ID donné par la base", () => {
  it("le numéro suivant, même après un acte annulé (un numéro ne sert qu'une fois)", async () => {
    const officier = await agent("officier");
    const kal = (await lireEntite(officier, "KAL"))!;
    const type = (await lireTypeParCode(officier, "ATIDC"))!;
    const annee = Number(aujourdhuiUvira().slice(0, 4));

    const premier = await enregistrerActe(officier, saisie(type.id), false, aujourdhuiUvira());
    if (!premier.ok) throw new Error(premier.message);
    sql(`update public.actes set statut = 'annule', motif_annulation = 'Essai' where id = '${premier.acte.id}'`);

    const prevu = idPrevu(kal.code, type.code, annee, await lireDernierNumero(officier, kal.id, type.id, annee));
    const second = await enregistrerActe(officier, saisie(type.id), false, aujourdhuiUvira());
    expect(second).toMatchObject({ ok: true, acte: { identifiant: prevu } });
    expect(prevu).not.toBe(premier.acte.identifiant);
  });
});

describe("Type désigné dans l'adresse", () => {
  it("code inconnu, mal écrit, ou type retiré du catalogue : rien", async () => {
    const officier = await agent("officier");
    expect(await lireTypeParCode(officier, "EXNAIS")).toMatchObject({ code: "EXNAIS", modele_fiche: "naissance" });
    expect(await lireTypeParCode(officier, "XXXXX")).toBeNull();
    expect(await lireTypeParCode(officier, "exnais'--")).toBeNull();
    sql(`update public.types_actes set actif = false where code = 'ATLOG'`);
    expect(await lireTypeParCode(officier, "ATLOG")).toBeNull();
  });
});

describe("Transmettre au Caissier", () => {
  it("un acte « enregistré » passe « en attente de paiement » ; une seconde fois, refus clair", async () => {
    const officier = await agent("officier");
    const type = (await lireTypeParCode(officier, "ATIDC"))!;
    const r = await enregistrerActe(officier, saisie(type.id), false, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    expect(r.acte.statut).toBe("enregistre");
    expect(await transmettreActe(officier, r.acte.id)).toMatchObject({ ok: true, acte: { statut: "en_attente_paiement", identifiant: r.acte.identifiant } });
    expect(await transmettreActe(officier, r.acte.id)).toMatchObject({ ok: false, message: expect.stringContaining("n'est plus « enregistré »") });
  });

  it("le caissier ne peut pas transmettre à la place de l'officier", async () => {
    const officier = await agent("officier");
    const type = (await lireTypeParCode(officier, "ATIDC"))!;
    const r = await enregistrerActe(officier, saisie(type.id), false, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    const caissier = await agent("caissier");
    expect((await transmettreActe(caissier, r.acte.id)).ok).toBe(false);
    expect(await lireActe(officier, r.acte.id)).toMatchObject({ statut: "enregistre" });
  });
});
