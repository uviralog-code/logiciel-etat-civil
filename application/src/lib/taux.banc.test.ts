// Fichier 26 — taux du jour contre le banc (vrai Supabase + vraie base)
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { connecterAgent } from "./connexion";
import { enregistrerTaux, etatTauxDuJour, lireHistoriqueTaux, MESSAGES_TAUX } from "./taux";
import { lireTauxEnVigueur } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
afterAll(() => {
  sql(`set session_replication_role = replica;
       delete from public.taux_change where entite_id in (select id from public.entites where code in ('BAV', 'KAV'));`);
});

async function agent(role: "officier" | "caissier", entite: "BAV" | "KAV") {
  const a = await creerAgent({ role, entite });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const idEntite = (code: string) => sql(`select id from public.entites where code = '${code}'`);

describe("Le caissier saisit le taux du jour", () => {
  it("enregistré à l'instant, appliqué tout de suite, en tête de l'historique, inscrit au journal", async () => {
    const caissier = await agent("caissier", "BAV");
    const bav = idEntite("BAV");
    // Un taux d'hier (saisi en maintenance)
    sql(`insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values ('${bav}', 2800, now() - interval '1 day')`);
    expect(etatTauxDuJour((await lireHistoriqueTaux(caissier, bav, 1))[0] ?? null)).toMatchObject({ type: "ancien", taux: 2800 });

    const r = await enregistrerTaux(caissier, bav, "2 850");
    expect(r).toEqual({ ok: true, taux: 2850, heure: expect.stringMatching(/^\d{2} h \d{2}$/) });
    expect(await lireTauxEnVigueur(caissier, bav)).toMatchObject({ taux: 2850 });
    expect(sql(`select trim_scale(public.taux_applicable('${bav}'))`)).toBe("2850");

    const historique = await lireHistoriqueTaux(caissier, bav);
    expect(historique.slice(0, 2).map((l) => l.taux)).toEqual([2850, 2800]);
    expect(etatTauxDuJour(historique[0])).toMatchObject({ type: "du-jour", taux: 2850 });
    expect(sql(`select count(*) from public.journal_audit where table_nom = 'taux_change' and operation = 'INSERT' and enregistrement_id = '${historique[0].id}'`)).toBe("1");
  });

  it("garde-fou : refusé par l'application… et par la base si l'on contourne l'application", async () => {
    const caissier = await agent("caissier", "BAV");
    const bav = idEntite("BAV");
    expect(await enregistrerTaux(caissier, bav, "285")).toMatchObject({ ok: false, message: expect.stringContaining("Taux invraisemblable") });
    const direct = await caissier.from("taux_change").insert({ entite_id: bav, taux: 285 });
    expect(direct.error?.code).toBe("23514");
  });
});

describe("Personne d'autre (la base l'impose)", () => {
  it("l'officier ne peut pas saisir le taux", async () => {
    const officier = await agent("officier", "KAV");
    const kav = idEntite("KAV");
    expect(await enregistrerTaux(officier, kav, "2850")).toEqual({ ok: false, message: MESSAGES_TAUX.refus });
    expect(sql(`select count(*) from public.taux_change where entite_id = '${kav}'`)).toBe("0");
  });

  it("le caissier d'une entité ne lit ni n'écrit le taux d'une autre", async () => {
    const bav = idEntite("BAV");
    sql(`insert into public.taux_change (entite_id, taux, en_vigueur_depuis) values ('${bav}', 2840, now() - interval '2 days')`);
    const caissierKav = await agent("caissier", "KAV");
    expect(await lireHistoriqueTaux(caissierKav, bav)).toEqual([]);
    expect(await enregistrerTaux(caissierKav, bav, "2860")).toEqual({ ok: false, message: MESSAGES_TAUX.refus });
    expect(sql(`select count(*) from public.taux_change where entite_id = '${bav}' and taux = 2860`)).toBe("0");
  });
});
