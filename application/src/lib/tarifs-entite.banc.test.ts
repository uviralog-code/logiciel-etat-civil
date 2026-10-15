// Fichier 25 — tarifs de l'entité contre le banc (vrai Supabase + vraie base)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { connecterAgent } from "./connexion";
import { MESSAGES_GRILLE } from "./grille-commune";
import { annulerAjustement, lignesTarifsEntite, lireEntite, MESSAGES_ENTITE, programmerAjustement, type SaisieAjustement } from "./tarifs-entite";
import { aujourdhuiUvira, lireDonneesTarifaires } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

const MOTIF = "Décision n° 0 (banc fichier 25)";
afterAll(() => {
  sql(`set session_replication_role = replica; delete from public.tarifs_entites where motif like '%banc fichier 25%';`);
});

async function agent(role: "officier" | "caissier", entite: "MUL" | "KAV" | "KAL" | "BAV") {
  const a = await creerAgent({ role, entite });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return { client, id: a.id };
}
const idActe = (code: string) => sql(`select id from public.types_actes where code = '${code}'`);
let decalage = 40 + Math.floor(Math.random() * 300);
const dateFuture = () => sql(`select (public.aujourdhui() + ${decalage++})::text`);
const saisie = (s: Partial<SaisieAjustement>): SaisieAjustement => ({
  mode: "prix", acteId: idActe("ATLOG"), categorie: "national", montant: "7 500", devise: "CDF", date: dateFuture(), motif: MOTIF, ...s,
});

describe("L'officier ajuste les tarifs de SON entité", () => {
  it("ajustement enregistré pour son entité, inscrit au journal, visible dans son tableau", async () => {
    const { client, id } = await agent("officier", "KAL");
    const entite = await lireEntite(client, "KAL");
    expect(entite).toMatchObject({ code: "KAL", nom: "Commune de Kalundu" });
    const s = saisie({});
    const r = await programmerAjustement(client, entite!, s);
    expect(r).toEqual({ ok: true, texte: expect.stringMatching(/^ATLOG : 7.500 FC à partir du \d{2}\/\d{2}\/\d{4}, pour Kalundu\.$/) });
    const ligne = sql(`select id || '|' || trim_scale(montant) || '|' || suit_grille_commune || '|' || cree_par from public.tarifs_entites
                        where entite_id = '${entite!.id}' and type_acte_id = '${s.acteId}' and en_vigueur_depuis = '${s.date}'`);
    const [ligneId, ...reste] = ligne.split("|");
    expect(reste).toEqual(["7500", "false", id]);
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'tarifs_entites' and operation = 'INSERT' and enregistrement_id = '${ligneId}'`)).toBe("1");

    const donnees = await lireDonneesTarifaires(client, { entiteId: entite!.id });
    const atlog = lignesTarifsEntite(donnees, entite!.id, aujourdhuiUvira()).find((l) => l.acte.code === "ATLOG")!;
    expect(atlog.changements).toContainEqual({ date: s.date, prix: { montant: 7500, devise: "CDF", source: "entite", depuis: s.date } });

    // Deux fois la même date : refus clair
    expect(await programmerAjustement(client, entite!, { ...s, montant: "8 000" })).toEqual({ ok: false, message: MESSAGES_ENTITE.doublon, champ: "date" });
  });

  it("retour à la grille commune : ligne sans montant ; le prix redevient celui de la grille à cette date", async () => {
    const { client } = await agent("officier", "BAV");
    const entite = (await lireEntite(client, "BAV"))!;
    const acte = idActe("ATPERT");
    const d1 = dateFuture();
    const d2 = dateFuture();
    expect((await programmerAjustement(client, entite, saisie({ acteId: acte, montant: "15 000", date: d1 }))).ok).toBe(true);
    const r = await programmerAjustement(client, entite, saisie({ mode: "grille", acteId: acte, montant: "", devise: "", date: d2 }));
    expect(r).toMatchObject({ ok: true, texte: expect.stringContaining("retour à la grille commune") });
    expect(sql(`select trim_scale(montant) from public.tarif_applicable('${entite.id}', '${acte}', 'national', '${d1}')`)).toBe("15000");
    expect(sql(`select source || ' ' || trim_scale(montant) from public.tarif_applicable('${entite.id}', '${acte}', 'national', '${d2}')`)).toBe("commune 18000");
  });

  it("annuler un ajustement à venir : oui ; un ajustement déjà en vigueur : non", async () => {
    const { client } = await agent("officier", "KAV");
    const entite = (await lireEntite(client, "KAV"))!;
    const s = saisie({ acteId: idActe("ATDEC") });
    await programmerAjustement(client, entite, s);
    const futur = sql(`select id from public.tarifs_entites where entite_id = '${entite.id}' and type_acte_id = '${s.acteId}' and en_vigueur_depuis = '${s.date}'`);
    expect(await annulerAjustement(client, futur)).toEqual({ ok: true });
    expect(sql(`select count(*) from public.tarifs_entites where id = '${futur}'`)).toBe("0");

    const passe = sql(`insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
                        values ('${entite.id}', '${idActe("ATDEC")}', 'national', 8500, 'CDF', '2026-03-01', '${MOTIF}') returning id`);
    expect(await annulerAjustement(client, passe, "2026-01-01")).toEqual({ ok: false, message: MESSAGES_GRILLE.dejaEnVigueur });
    expect(sql(`select count(*) from public.tarifs_entites where id = '${passe}'`)).toBe("1");
  });
});

describe("Personne d'autre (la base l'impose)", () => {
  it("un officier ne voit pas une autre entité et ne peut pas y écrire, ni y annuler", async () => {
    const mul = sql(`select id from public.entites where code = 'MUL'`);
    const { client } = await agent("officier", "KAL");
    expect(await lireEntite(client, "MUL")).toBeNull();
    const s = saisie({ acteId: idActe("ATIDC") });
    expect(await programmerAjustement(client, { id: mul, nom: "Commune de Mulongwe" }, s)).toEqual({ ok: false, message: MESSAGES_ENTITE.refus });
    expect(sql(`select count(*) from public.tarifs_entites where entite_id = '${mul}' and en_vigueur_depuis = '${s.date}'`)).toBe("0");

    // Un ajustement à venir de Mulongwe : l'officier de Kalundu ne peut pas l'annuler
    const autre = sql(`insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif)
                        values ('${mul}', '${idActe("ATIDC")}', 'national', 9000, 'CDF', '${dateFuture()}', '${MOTIF}') returning id`);
    expect((await annulerAjustement(client, autre)).ok).toBe(false);
    expect(sql(`select count(*) from public.tarifs_entites where id = '${autre}'`)).toBe("1");
  });

  it("le caissier voit les tarifs de son entité mais ne peut pas les ajuster", async () => {
    const { client } = await agent("caissier", "KAL");
    const entite = (await lireEntite(client, "KAL"))!;
    const donnees = await lireDonneesTarifaires(client, { entiteId: entite.id });
    expect(donnees.actes.length).toBeGreaterThanOrEqual(20);
    expect(lignesTarifsEntite(donnees, entite.id, aujourdhuiUvira()).length).toBeGreaterThan(donnees.actes.length);
    const s = saisie({ acteId: idActe("ATIDC") });
    expect(await programmerAjustement(client, entite, s)).toEqual({ ok: false, message: MESSAGES_ENTITE.refus });
    expect(sql(`select count(*) from public.tarifs_entites where en_vigueur_depuis = '${s.date}'`)).toBe("0");
  });
});
