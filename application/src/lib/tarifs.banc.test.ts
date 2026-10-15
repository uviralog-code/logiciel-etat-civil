// Fichier 23 — outils des tarifs contre le banc (vrai Supabase + vraie base)
//
// 1. Le prix calculé par l'application est IDENTIQUE à celui de la base
//    (tarif_applicable) : pour chaque acte, chaque catégorie, aujourd'hui et
//    à des dates futures, avec et sans ajustements de l'entité.
// 2. La migration 17 tient aussi à travers l'API : un tarif pour aujourd'hui
//    est refusé, un tarif pour demain est accepté ; le taux du jour est immédiat.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { codeTotp } from "@/test/totp";
import { connecterAgent } from "./connexion";
import {
  aujourdhuiUvira,
  calculerGrille,
  lendemain,
  lireDonneesTarifaires,
  lireTauxEnVigueur,
  prixApplicable,
  type Categorie,
} from "./tarifs";
import { commencerMiseEnPlace, verifierCode } from "./verification";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const nouveauClient = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });

const MOTIF = "banc fichier 23";
// Lignes d'essai effacées à la fin (en mode maintenance, sans les protections de l'historique)
afterAll(() => {
  sql(`set session_replication_role = replica;
       delete from public.tarifs_entites where motif = '${MOTIF}';
       delete from public.tarifs_communs where motif = '${MOTIF}';
       delete from public.taux_change where entite_id = (select id from public.entites where code = 'KAL');`);
});

async function agent(role: "officier" | "caissier", entite: "KAL" | "BAV") {
  const a = await creerAgent({ role, entite });
  const client = nouveauClient();
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}

async function administrateurVerifie(): Promise<SupabaseClient> {
  const admin = await creerAgent({ role: "admin" });
  const client = nouveauClient();
  await connecterAgent(client, { nom: admin.nom, motDePasse: admin.motDePasse });
  const debut = await commencerMiseEnPlace(client);
  if (!debut.ok) throw new Error(debut.message);
  const r = await verifierCode(client, { code: codeTotp(debut.miseEnPlace.cle), idFacteur: debut.miseEnPlace.idFacteur }, { nomUtilisateur: admin.nom });
  if (!r.ok) throw new Error(r.message);
  return client;
}

const idEntite = (code: string) => sql(`select id from public.entites where code = '${code}'`);
const idActe = (code: string) => sql(`select id from public.types_actes where code = '${code}'`);

/** Prix donné par la base, pour toutes les combinaisons d'un coup : « acte|catégorie » → « montant devise ». */
function prixDeLaBase(entiteId: string, date: string): Map<string, string> {
  const lignes = sql(`select t.id || '|' || c.categorie || '|' || coalesce(trim_scale(p.montant)::text || ' ' || p.devise, 'aucun')
                        from public.types_actes t
                        cross join (values ('national'::public.categorie_tarif), ('etranger')) c(categorie)
                        left join lateral public.tarif_applicable('${entiteId}', t.id, c.categorie, '${date}'::date) p on true
                       where t.actif`);
  return new Map(
    lignes.split("\n").filter(Boolean).map((l) => {
      const [acte, categorie, prix] = l.split("|");
      return [`${acte}|${categorie}`, prix];
    }),
  );
}

const texte = (p: { montant: number; devise: string } | null) => (p ? `${Number(p.montant)} ${p.devise}` : "aucun");

describe("Le prix calculé par l'application = le prix de la base", () => {
  it("pour chaque acte et chaque catégorie, aujourd'hui et aux dates des changements programmés", async () => {
    const kal = idEntite("KAL");
    const jour = aujourdhuiUvira();
    const demain = lendemain(jour);
    const dans10 = sql(`select (public.aujourdhui() + 10)::text`);
    const dans20 = sql(`select (public.aujourdhui() + 20)::text`);
    const atres = idActe("ATRES");
    const veuv = idActe("ATVEUV");
    const exnais = idActe("EXNAIS");
    // Ajustements variés (saisis en maintenance pour pouvoir les dater du passé)
    sql(`insert into public.tarifs_entites (entite_id, type_acte_id, categorie, suit_grille_commune, montant, devise, en_vigueur_depuis, motif) values
           ('${kal}', '${veuv}',   'national', false, 4000,  'CDF', '2026-03-01', '${MOTIF}'),
           ('${kal}', '${veuv}',   'national', true,  null,  null,  '${dans20}',  '${MOTIF}'),
           ('${kal}', '${atres}',  'etranger', false, 45000, 'CDF', '${demain}',  '${MOTIF}'),
           ('${kal}', '${exnais}', 'national', false, 25,    'USD', '${dans10}',  '${MOTIF}')`);
    sql(`insert into public.tarifs_communs (type_acte_id, categorie, montant, devise, en_vigueur_depuis, motif) values
           ('${exnais}', 'national', 40, 'USD', '${dans20}', '${MOTIF}'),
           ('${veuv}',   'national', 6000, 'CDF', '${dans10}', '${MOTIF}')`);

    const donnees = await lireDonneesTarifaires(await agent("officier", "KAL"), { entiteId: kal });
    expect(donnees.actes.length).toBeGreaterThanOrEqual(20);
    expect(donnees.ajustements.filter((a) => a.motif === MOTIF)).toHaveLength(4);

    let comparaisons = 0;
    for (const date of [jour, demain, dans10, dans20, lendemain(dans20)]) {
      const base = prixDeLaBase(kal, date);
      for (const acte of donnees.actes) {
        for (const categorie of ["national", "etranger"] as Categorie[]) {
          const calcule = prixApplicable(acte, categorie, donnees.communs, donnees.ajustements, date);
          expect(`${acte.code} ${categorie} ${date} : ${texte(calcule)}`).toBe(`${acte.code} ${categorie} ${date} : ${base.get(`${acte.id}|${categorie}`)}`);
          comparaisons++;
        }
      }
    }
    expect(comparaisons).toBeGreaterThanOrEqual(200);

    // La grille annonce les changements programmés, comme la base les appliquera
    const grille = calculerGrille(donnees.actes, donnees.communs, donnees.ajustements, jour);
    const ligne = (code: string) => grille.find((l) => l.acte.code === code)!;
    expect(ligne("ATVEUV").categories[0]).toMatchObject({
      ajustement: { montant: 4000, devise: "CDF" },
      applique: { montant: 4000, source: "entite" },
      changements: [{ date: dans20, prix: { montant: 6000, devise: "CDF", source: "commune" } }],
    });
    expect(ligne("ATRES").categories[1].changements).toEqual([
      { date: demain, prix: { montant: 45000, devise: "CDF", source: "entite", depuis: demain } },
    ]);
    // EXNAIS : ajustement à 25 $ dans 10 jours ; la nouvelle grille commune (40 $) ne le touche pas
    expect(ligne("EXNAIS").categories[0].changements).toEqual([
      { date: dans10, prix: { montant: 25, devise: "USD", source: "entite", depuis: dans10 } },
    ]);
  });

  it("une autre entité ne voit pas ces ajustements et garde la grille commune", async () => {
    const bav = idEntite("BAV");
    const donnees = await lireDonneesTarifaires(await agent("caissier", "BAV"), { entiteId: idEntite("KAL") });
    expect(donnees.ajustements).toEqual([]); // la base refuse de les montrer
    const siens = await lireDonneesTarifaires(await agent("officier", "BAV"), { entiteId: bav });
    const base = prixDeLaBase(bav, aujourdhuiUvira());
    for (const acte of siens.actes) {
      expect(texte(prixApplicable(acte, "national", siens.communs, siens.ajustements, aujourdhuiUvira()))).toBe(base.get(`${acte.id}|national`));
    }
  });
});

describe("Migration 17 à travers l'API", () => {
  it("administrateur vérifié : grille commune refusée pour aujourd'hui, acceptée pour demain", async () => {
    const admin = await administrateurVerifie();
    const exnais = idActe("EXNAIS");
    const jour = aujourdhuiUvira();
    const refus = await admin.from("tarifs_communs").insert({ type_acte_id: exnais, montant: 35, devise: "USD", en_vigueur_depuis: jour, motif: MOTIF });
    expect(refus.error?.message).toContain("au plus tôt demain");
    const ok = await admin.from("tarifs_communs").insert({ type_acte_id: exnais, montant: 35, devise: "USD", en_vigueur_depuis: lendemain(jour), motif: MOTIF });
    expect(ok.error).toBeNull();
  });

  it("officier : ajustement refusé pour aujourd'hui, accepté pour demain ; le prix du jour ne bouge pas", async () => {
    const officier = await agent("officier", "KAL");
    const kal = idEntite("KAL");
    const acte = idActe("ATMAR");
    const jour = aujourdhuiUvira();
    const avant = sql(`select trim_scale(montant) from public.tarif_applicable('${kal}', '${acte}', 'national')`);
    const ligne = { entite_id: kal, type_acte_id: acte, categorie: "national", montant: 123456, devise: "CDF", motif: MOTIF };
    const refus = await officier.from("tarifs_entites").insert({ ...ligne, en_vigueur_depuis: jour });
    expect(refus.error?.message).toContain("au plus tôt demain");
    const ok = await officier.from("tarifs_entites").insert({ ...ligne, en_vigueur_depuis: lendemain(jour) });
    expect(ok.error).toBeNull();
    expect(sql(`select trim_scale(montant) from public.tarif_applicable('${kal}', '${acte}', 'national')`)).toBe(avant);
    expect(sql(`select trim_scale(montant) from public.tarif_applicable('${kal}', '${acte}', 'national', public.aujourdhui() + 1)`)).toBe("123456");
  });

  it("caissier : le taux saisi s'applique tout de suite ; un taux antidaté est refusé", async () => {
    const caissier = await agent("caissier", "KAL");
    const kal = idEntite("KAL");
    const ok = await caissier.from("taux_change").insert({ entite_id: kal, taux: 2850 });
    expect(ok.error).toBeNull();
    expect(await lireTauxEnVigueur(caissier, kal)).toMatchObject({ taux: 2850 });
    const refus = await caissier
      .from("taux_change")
      .insert({ entite_id: kal, taux: 2700, en_vigueur_depuis: new Date(Date.now() - 3600_000).toISOString() });
    expect(refus.error?.message).toContain("ni antidaté");
    expect(await lireTauxEnVigueur(caissier, kal)).toMatchObject({ taux: 2850 });
  });
});
