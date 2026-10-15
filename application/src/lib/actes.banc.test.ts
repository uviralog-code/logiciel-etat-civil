// Fichier 28 — actes contre le banc (vrai Supabase + vraie base, migration 19)
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { corrigerActe, enregistrerActe, lireActe, MESSAGES_ACTE, saisieDepuisActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

async function agent(role: "officier" | "caissier", entite: "MUL" | "KAV") {
  const a = await creerAgent({ role, entite });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const idType = (code: string) => sql(`select id from public.types_actes where code = '${code}'`);
const naissance = (s: Partial<SaisieActe> = {}): SaisieActe => ({
  typeActeId: idType("EXNAIS"), categorie: "national", titulaire: "MUGISHO Bahati Jean", titulaire2: "", demandeur: "Mugisho Pierre",
  telephone: "+243 990 000 000", observations: "",
  details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: "Uvira", nom_pere: "Mugisho Pierre", nom_mere: "Bahati Claire" }, ...s,
});

describe("Enregistrer un acte avec sa fiche", () => {
  it("transmis : ID, prix et statut donnés par la base ; relu avec sa fiche", async () => {
    const officier = await agent("officier", "MUL");
    const r = await enregistrerActe(officier, naissance(), true, aujourdhuiUvira());
    expect(r).toEqual({
      ok: true,
      acte: { id: expect.any(String), identifiant: expect.stringMatching(/^MUL-EXNAIS-\d{4}-\d{6}$/), statut: "en_attente_paiement", montant_du: 30, devise_du: "USD" },
    });
    const acte = await lireActe(officier, r.ok ? r.acte.id : "");
    expect(acte).toMatchObject({
      titulaire_nom: "MUGISHO Bahati Jean",
      type: { code: "EXNAIS", modele_fiche: "naissance" },
      entite: { code: "MUL" },
      details: { sexe: "M", date_naissance: "2015-03-21", nom_mere: "Bahati Claire" },
    });
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'details_naissance' and enregistrement_id = '${acte!.id}'`)).toBe("1");
  });

  it("mariage sans second époux : refusé par l'application ; contournée, la base refuse aussi, sans rien laisser", async () => {
    const officier = await agent("officier", "MUL");
    const mariage = { ...naissance(), typeActeId: idType("MAR"), details: { date_celebration: "2026-10-10" } };
    expect(await enregistrerActe(officier, mariage, false, aujourdhuiUvira())).toMatchObject({ ok: false, champ: "titulaire2" });
    const avant = sql(`select count(*) from public.actes`);
    const direct = await officier.rpc("enregistrer_acte", {
      p_type_acte: idType("MAR"), p_categorie: "national", p_titulaire_nom: "Kasongo Jean", p_titulaire_2_nom: null, p_demandeur_nom: null,
      p_demandeur_telephone: null, p_observations: null, p_details: { date_celebration: "2026-10-10" }, p_transmettre: false,
    });
    expect(direct.error?.message).toContain("deux époux");
    expect(sql(`select count(*) from public.actes`)).toBe(avant);
  });

  it("caissier : refusé", async () => {
    const caissier = await agent("caissier", "MUL");
    expect(await enregistrerActe(caissier, naissance(), true, aujourdhuiUvira())).toEqual({ ok: false, message: MESSAGES_ACTE.refus });
  });
});

describe("Corriger un acte", () => {
  it("après un renvoi du caissier : acte et fiche corrigés, retransmis, même ID", async () => {
    const officier = await agent("officier", "MUL");
    const r = await enregistrerActe(officier, naissance(), true, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    const caissier = await agent("caissier", "MUL");
    expect((await caissier.rpc("renvoyer_a_l_officier", { p_acte: r.acte.id, p_motif: "Le père s'appelle Mugisho Pierre-Claver" })).error).toBeNull();

    const acte = (await lireActe(officier, r.acte.id))!;
    expect(acte).toMatchObject({ statut: "enregistre", motif_renvoi: "Le père s'appelle Mugisho Pierre-Claver" });
    const saisie = saisieDepuisActe(acte);
    const c = await corrigerActe(officier, acte.id, { ...saisie, details: { ...saisie.details, nom_pere: "Mugisho Pierre-Claver" } }, true, aujourdhuiUvira());
    expect(c).toMatchObject({ ok: true, acte: { identifiant: r.acte.identifiant, statut: "en_attente_paiement" } });
    expect(await lireActe(officier, acte.id)).toMatchObject({ motif_renvoi: null, details: { nom_pere: "Mugisho Pierre-Claver" } });
  });

  it("un acte déjà transmis ne se corrige pas tant que le Caissier ne l'a pas renvoyé ; la date est celle d'Uvira", async () => {
    const officier = await agent("officier", "MUL");
    const r = await enregistrerActe(officier, naissance(), true, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    expect(await corrigerActe(officier, r.acte.id, naissance({ titulaire: "Autre Nom" }), false, aujourdhuiUvira())).toEqual({
      ok: false,
      message: "Seul un acte « enregistré » (pas encore transmis, ou renvoyé par le Caissier) se corrige ici. Pour un acte déjà transmis, demandez au Caissier de vous le renvoyer.",
    });
    expect(await lireActe(officier, r.acte.id)).toMatchObject({ titulaire_nom: "MUGISHO Bahati Jean", date_acte: aujourdhuiUvira() });
  });

  it("un officier d'une autre entité ne voit pas l'acte et ne peut pas le corriger", async () => {
    const mul = await agent("officier", "MUL");
    const r = await enregistrerActe(mul, naissance(), false, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    const kav = await agent("officier", "KAV");
    expect(await lireActe(kav, r.acte.id)).toBeNull();
    expect(await corrigerActe(kav, r.acte.id, naissance({ titulaire: "Autre nom" }), false, aujourdhuiUvira())).toEqual({ ok: false, message: "Acte introuvable." });
    expect(sql(`select titulaire_nom from public.actes where id = '${r.acte.id}'`)).toBe("MUGISHO Bahati Jean");
  });
});
