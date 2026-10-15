// Fichier 24 — grille commune contre le banc (vrai Supabase + vraie base)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent } from "./connexion";
import { annulerTarifCommun, lireEntites, MESSAGES_GRILLE, programmerTarifCommun, type SaisieTarif } from "./grille-commune";
import { lireDonneesTarifaires } from "./tarifs";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

const MOTIF = "Arrêté n° 0 (banc fichier 24)";
afterAll(() => {
  sql(`set session_replication_role = replica;
       delete from public.tarifs_communs where motif like '%banc fichier 24%';
       delete from public.tarifs_entites where motif like '%banc fichier 24%';`);
});

async function administrateur(verifie = true): Promise<{ client: SupabaseClient; id: string }> {
  const admin = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: admin.nom, motDePasse: admin.motDePasse });
  if (verifie) {
    const debut = await commencerMiseEnPlace(client);
    if (!debut.ok) throw new Error(debut.message);
    const r = await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: admin.nom });
    if (!r.ok) throw new Error(r.message);
  }
  return { client, id: admin.id };
}

const idActe = (code: string) => sql(`select id from public.types_actes where code = '${code}'`);
/** Une date future différente à chaque appel (évite deux lignes à la même date). */
let decalage = 40 + Math.floor(Math.random() * 300);
const dateFuture = () => sql(`select (public.aujourdhui() + ${decalage++})::text`);
const saisie = (s: Partial<SaisieTarif>): SaisieTarif => ({
  acteId: idActe("ATIDC"), categorie: "national", montant: "12 500", devise: "CDF", date: dateFuture(), motif: MOTIF, ...s,
});

describe("Programmer un tarif commun", () => {
  it("administrateur vérifié : enregistré tel quel, inscrit au journal d'audit, visible dans la grille", async () => {
    const { client, id } = await administrateur();
    const s = saisie({});
    const r = await programmerTarifCommun(client, s);
    expect(r).toEqual({ ok: true, texte: expect.stringMatching(/^ATIDC : 12.500 FC à partir du \d{2}\/\d{2}\/\d{4}, pour les 4 entités\.$/) });
    const ligne = sql(`select id || '|' || trim_scale(montant) || '|' || devise || '|' || categorie || '|' || cree_par
                         from public.tarifs_communs where type_acte_id = '${s.acteId}' and en_vigueur_depuis = '${s.date}'`);
    const [ligneId, ...reste] = ligne.split("|");
    expect(reste).toEqual(["12500", "CDF", "national", id]);
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'tarifs_communs' and operation = 'INSERT'
                  and enregistrement_id = '${ligneId}' and utilisateur_id = '${id}'`)).toBe("1");
    const donnees = await lireDonneesTarifaires(client);
    expect(donnees.communs.some((c) => c.id === ligneId)).toBe(true);
  });

  it("deux changements le même jour pour le même acte : le second est refusé avec un message clair", async () => {
    const { client } = await administrateur();
    const s = saisie({ acteId: idActe("ATLOG") });
    expect((await programmerTarifCommun(client, s)).ok).toBe(true);
    expect(await programmerTarifCommun(client, { ...s, montant: "13 000" })).toEqual({ ok: false, message: MESSAGES_GRILLE.doublon, champ: "date" });
  });

  it("contrôles refaits sur le serveur : aujourd'hui, catégorie impossible, acte inconnu", async () => {
    const { client } = await administrateur();
    const aujourdhui = sql(`select public.aujourdhui()::text`);
    expect(await programmerTarifCommun(client, saisie({ date: aujourdhui }))).toMatchObject({ ok: false, champ: "date" });
    expect(await programmerTarifCommun(client, saisie({ categorie: "etranger" }))).toMatchObject({ ok: false, champ: "categorie" });
    expect(await programmerTarifCommun(client, saisie({ acteId: "pas-un-identifiant" }))).toMatchObject({ ok: false, champ: "acte" });
    expect(sql(`select count(*) from public.tarifs_communs where en_vigueur_depuis = '${aujourdhui}'`)).toBe("0");
  });

  it("la base refuse aussi, même si l'application ne contrôlait pas : la date d'aujourd'hui", async () => {
    const { client } = await administrateur();
    const aujourdhui = sql(`select public.aujourdhui()::text`);
    // Contrôle de l'application contourné (on lui fait croire qu'on est hier) : c'est la base qui refuse
    const hier = sql(`select (public.aujourdhui() - 1)::text`);
    const r = await programmerTarifCommun(client, saisie({ date: aujourdhui }), hier);
    expect(r).toMatchObject({ ok: false, champ: "date", message: expect.stringContaining("au plus tôt demain") });
  });

  it("administrateur SANS le code à 6 chiffres, ou officier : refusé, rien n'est enregistré", async () => {
    const { client: sansCode } = await administrateur(false);
    const s = saisie({ acteId: idActe("ATIDC") });
    // L'acte n'est même pas lisible sans le code : la saisie est refusée
    expect((await programmerTarifCommun(sansCode, s)).ok).toBe(false);
    const officier = await creerAgent({ role: "officier", entite: "KAV" });
    const client = nouveauClient();
    await connecterAgent(client, { nom: officier.nom, motDePasse: officier.motDePasse });
    expect(await programmerTarifCommun(client, s)).toEqual({ ok: false, message: MESSAGES_GRILLE.refus });
    expect(sql(`select count(*) from public.tarifs_communs where en_vigueur_depuis = '${s.date}'`)).toBe("0");
  });
});

describe("Annuler un changement programmé", () => {
  it("pas encore en vigueur : supprimé, et l'annulation est inscrite au journal", async () => {
    const { client, id } = await administrateur();
    const s = saisie({ acteId: idActe("ATPEC") });
    await programmerTarifCommun(client, s);
    const ligneId = sql(`select id from public.tarifs_communs where type_acte_id = '${s.acteId}' and en_vigueur_depuis = '${s.date}'`);
    expect(await annulerTarifCommun(client, ligneId)).toEqual({ ok: true });
    expect(sql(`select count(*) from public.tarifs_communs where id = '${ligneId}'`)).toBe("0");
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'tarifs_communs' and operation = 'DELETE'
                  and enregistrement_id = '${ligneId}' and utilisateur_id = '${id}'`)).toBe("1");
    // Une seconde fois : déjà annulé
    expect(await annulerTarifCommun(client, ligneId)).toEqual({ ok: false, message: MESSAGES_GRILLE.dejaEnVigueur });
  });

  it("déjà en vigueur (grille du 01/01/2026) : impossible, l'historique est intact", async () => {
    const { client } = await administrateur();
    const ligneId = sql(`select id from public.tarifs_communs where type_acte_id = '${idActe("EXNAIS")}' and en_vigueur_depuis = '2026-01-01'`);
    expect(await annulerTarifCommun(client, ligneId)).toEqual({ ok: false, message: MESSAGES_GRILLE.dejaEnVigueur });
    // Même en contournant le contrôle de date de l'application, la base refuse
    expect(await annulerTarifCommun(client, ligneId, "2025-01-01")).toEqual({ ok: false, message: MESSAGES_GRILLE.dejaEnVigueur });
    expect(sql(`select count(*) from public.tarifs_communs where id = '${ligneId}'`)).toBe("1");
  });
});

describe("Lecture pour l'écran", () => {
  it("l'administrateur voit les 4 entités dans l'ordre et les ajustements de toutes ; un officier, les siens seulement", async () => {
    const kav = sql(`select id from public.entites where code = 'KAV'`);
    const bav = sql(`select id from public.entites where code = 'BAV'`);
    sql(`insert into public.tarifs_entites (entite_id, type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif) values
           ('${kav}', '${idActe("ATVEUV")}', 'national', 4500, 'CDF', '2026-02-01', '${MOTIF}'),
           ('${bav}', '${idActe("ATVEUV")}', 'national', 4200, 'CDF', '2026-02-01', '${MOTIF}')`);
    const { client } = await administrateur();
    expect((await lireEntites(client)).map((e) => e.code)).toEqual(["MUL", "KAV", "KAL", "BAV"]);
    const tout = await lireDonneesTarifaires(client);
    expect(new Set(tout.ajustements.filter((a) => a.motif === MOTIF).map((a) => a.entite_id))).toEqual(new Set([kav, bav]));

    const officier = await creerAgent({ role: "officier", entite: "KAV" });
    const o = nouveauClient();
    await connecterAgent(o, { nom: officier.nom, motDePasse: officier.motDePasse });
    const siens = await lireDonneesTarifaires(o);
    expect(siens.ajustements.filter((a) => a.motif === MOTIF).map((a) => a.entite_id)).toEqual([kav]);
  });
});
