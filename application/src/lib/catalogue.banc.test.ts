// Fichier 27 — catalogue des actes contre le banc (vrai Supabase + vraie base, migration 18)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { ajouterTypeActe, changerPresence, corrigerTypeActe, lireTypesActes, MESSAGES_CATALOGUE, type SaisieTypeActe } from "./catalogue";
import { connecterAgent } from "./connexion";
import { aujourdhuiUvira, lendemain, lireDonneesTarifaires } from "./tarifs";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

afterAll(() => {
  sql(`set session_replication_role = replica;
       delete from public.tarifs_communs where type_acte_id in (select id from public.types_actes where numero >= 100);
       delete from public.types_actes where numero >= 100;
       update public.types_actes set actif = true, libelle = 'Certificat de vie', famille = 'certificat', couleur = '#00727C' where code = 'CVIE';`);
});

async function administrateur(verifie = true): Promise<SupabaseClient> {
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
async function officier() {
  const o = await creerAgent({ role: "officier", entite: "KAL" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: o.nom, motDePasse: o.motDePasse });
  return client;
}

let numero = 100 + Math.floor(Math.random() * 400);
const lettres = () => Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const saisie = (s: Partial<SaisieTypeActe> = {}): SaisieTypeActe => ({
  numero: String(numero++), code: lettres(), libelle: `Acte d'essai ${lettres()}`, famille: "attestation", modele: "generique", couleur: "#1565C0",
  distinctEtranger: true, montantNational: "11 000", deviseNational: "CDF", montantEtranger: "25", deviseEtranger: "USD",
  date: lendemain(aujourdhuiUvira()), motif: "Arrêté n° 0 (banc fichier 27)", ...s,
});

describe("Ajouter un type d'acte (avec son prix, en une seule opération)", () => {
  it("au catalogue, avec ses deux prix dès demain, inscrit au journal", async () => {
    const admin = await administrateur();
    const s = saisie();
    expect(await ajouterTypeActe(admin, s, aujourdhuiUvira())).toEqual({
      ok: true, texte: `${s.code} — ${s.libelle} : ajouté au catalogue, disponible dès demain.`,
    });
    const id = sql(`select id from public.types_actes where code = '${s.code}'`);
    expect(sql(`select string_agg(categorie || ' ' || trim_scale(montant) || ' ' || devise, ', ' order by categorie) from public.tarifs_communs where type_acte_id = '${id}'`))
      .toBe("national 11000 CDF, etranger 25 USD");
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'types_actes' and operation = 'INSERT' and enregistrement_id = '${id}'`)).toBe("1");
    expect((await lireTypesActes(admin)).some((a) => a.code === s.code && a.actif)).toBe(true);
  });

  it("refus traduits : numéro ou code déjà pris (même en contournant le contrôle de l'application)", async () => {
    const admin = await administrateur();
    expect(await ajouterTypeActe(admin, saisie({ numero: "22" }), aujourdhuiUvira())).toMatchObject({ ok: false, champ: "numero" });
    expect(await ajouterTypeActe(admin, saisie({ code: "EXNAIS" }), aujourdhuiUvira())).toMatchObject({ ok: false, champ: "code" });
    const direct = await admin.rpc("ajouter_type_acte", {
      p_numero: 22, p_code: "ZZZZ", p_libelle: "Doublon", p_famille: "attestation", p_modele_fiche: "generique", p_distinct_etranger: false,
      p_couleur: null, p_montant_national: 1000, p_devise_national: "CDF", p_montant_etranger: null, p_devise_etranger: null,
      p_en_vigueur_depuis: lendemain(aujourdhuiUvira()), p_motif: "x",
    });
    expect(direct.error?.code).toBe("23505");
    expect(sql(`select count(*) from public.types_actes where code = 'ZZZZ'`)).toBe("0");
  });

  it("officier, ou administrateur sans son code : refusé, rien n'est créé", async () => {
    const s = saisie();
    expect(await ajouterTypeActe(await officier(), s, aujourdhuiUvira())).toMatchObject({ ok: false });
    expect(await ajouterTypeActe(await administrateur(false), s, aujourdhuiUvira())).toMatchObject({ ok: false });
    expect(sql(`select count(*) from public.types_actes where code = '${s.code}'`)).toBe("0");
  });
});

describe("Retirer, remettre, corriger — jamais supprimer", () => {
  it("retiré : disparaît des tarifs des entités ; remis : revient", async () => {
    const admin = await administrateur();
    const cvie = sql(`select id from public.types_actes where code = 'CVIE'`);
    expect(await changerPresence(admin, cvie, false)).toEqual({ ok: true, texte: "CVIE — Certificat de vie : retiré du catalogue." });
    const o = await officier();
    expect((await lireDonneesTarifaires(o)).actes.some((a) => a.code === "CVIE")).toBe(false);
    expect(await changerPresence(admin, cvie, true)).toMatchObject({ ok: true, texte: expect.stringContaining("remis au catalogue") });
    expect((await lireDonneesTarifaires(o)).actes.some((a) => a.code === "CVIE")).toBe(true);
  });

  it("corriger le libellé, la famille, la couleur : oui ; le code ou une suppression : la base refuse", async () => {
    const admin = await administrateur();
    const cvie = sql(`select id from public.types_actes where code = 'CVIE'`);
    expect(await corrigerTypeActe(admin, cvie, { libelle: "Certificat de vie (attestation d'existence)", famille: "attestation", couleur: "#1565C0" }))
      .toEqual({ ok: true, texte: "CVIE : corrigé." });
    expect(sql(`select libelle || ' ' || famille from public.types_actes where id = '${cvie}'`)).toBe("Certificat de vie (attestation d'existence) attestation");

    const code = await admin.from("types_actes").update({ code: "CVIEX" }).eq("id", cvie);
    expect(code.error?.message).toContain("fixés à sa création");
    const suppression = await admin.from("types_actes").delete().eq("id", cvie);
    expect(suppression.error?.message).toContain("ne se supprime jamais");
    expect(sql(`select code from public.types_actes where id = '${cvie}'`)).toBe("CVIE");
  });

  it("un officier ne peut ni retirer ni corriger", async () => {
    const o = await officier();
    const exnais = sql(`select id from public.types_actes where code = 'EXNAIS'`);
    expect(await changerPresence(o, exnais, false)).toEqual({ ok: false, message: MESSAGES_CATALOGUE.refus });
    expect(sql(`select actif from public.types_actes where id = '${exnais}'`)).toBe("t");
  });
});
