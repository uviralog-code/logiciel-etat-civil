// Fichier 36 — anciens registres contre le banc (vrai Supabase : Auth, PostgREST, Storage ; migration 23)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent } from "@/test/banc";
import { ajouterActeAncien, creerLot, fermerLot, lireLot, lireLots } from "./anciens-registres";
import { assemblerPdf, empreinteSha256 } from "./archivage";
import { connecterAgent } from "./connexion";
import { envoyerScan } from "./envoi-reprenable";
import { lireDernierNumero, lireTypeParCode } from "./nouvel-acte";
import { rechercherActes } from "./recherche";
import { cheminPrevu, enregistrerScan, lireScans } from "./scans";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const REGISTRE = new Uint8Array(readFileSync(new URL("../test/fichiers/registre-2-pages.pdf", import.meta.url)));

describe("Anciens registres (Kalundu)", () => {
  it("lot ouvert → anciens actes → scans en mode « lot » (dont un découpé dans un gros PDF) → doublon refusé → fermeture", async () => {
    const a = await creerAgent({ role: "officier", entite: "KAL" });
    const officier = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
    await connecterAgent(officier, { nom: a.nom, motDePasse: a.motDePasse });
    const exnais = (await lireTypeParCode(officier, "EXNAIS"))!;
    const annee = 1998;

    const lot = await creerLot(officier, { typeActeId: exnais.id, annee: String(annee), description: "Registre des naissances 1998, volume 2" }, 2026);
    if (!lot.ok) throw new Error(lot.message);
    expect(await creerLot(officier, { typeActeId: exnais.id, annee: "2031", description: "Futur" }, 2026)).toMatchObject({ ok: false, champ: "annee" });

    const kal = (await officier.from("entites").select("id").eq("code", "KAL").single<{ id: string }>()).data!;
    const avant = await lireDernierNumero(officier, kal.id, exnais.id, annee);

    // Acte 1 : un fichier ; acte 2 : la 2e page d'un gros PDF du registre
    const jeton = (await officier.auth.getSession()).data.session!.access_token;
    const joindre = async (acteId: string, octets: Uint8Array) => {
      await envoyerScan({ url: banc.url, clePublique: banc.clePublique, jeton, chemin: await cheminPrevu(officier, acteId), octets, empreinte: await empreinteSha256(octets) });
      return enregistrerScan(officier, { acteId, motif: null, mode: "fichier", lotId: lot.id });
    };
    const r1 = await ajouterActeAncien(officier, lot.id, { titulaire: "Furaha Espoir", titulaire2: "", date: `${annee}-05-10`, numero: "412" });
    if (!r1.ok) throw new Error(r1.message);
    expect(r1.acte.identifiant).toBe(`KAL-EXNAIS-${annee}-${String(avant + 1).padStart(6, "0")}`);
    const page1 = await assemblerPdf([{ genre: "pdf", source: 0, page: 0, rotation: 0 }], [REGISTRE]);
    expect(await joindre(r1.acte.id, page1)).toEqual({ ok: true, version: 1, pages: 1 });

    const r2 = await ajouterActeAncien(officier, lot.id, { titulaire: "Bahati Claire", titulaire2: "", date: `${annee}-05-11`, numero: "413" });
    if (!r2.ok) throw new Error(r2.message);

    // Le même n° (écrit autrement) : refusé, avec l'ID existant
    expect(await ajouterActeAncien(officier, lot.id, { titulaire: "Autre", titulaire2: "", date: `${annee}-06-01`, numero: "n° 412" })).toEqual({
      ok: false, champ: "numero", message: `Le n° 412 du registre ${annee} est déjà numérisé : ${r1.acte.identifiant}.`,
    });

    // L'acte 2 n'a pas encore son scan : le lot ne se ferme pas
    const detail = (await lireLot(officier, lot.id))!;
    expect(detail.lot).toMatchObject({ nb_actes: 2, nb_scannes: 1, statut: "ouvert", type_code: "EXNAIS", annee_registre: annee });
    expect(detail.actes.map((x) => [x.numeroRegistre, x.scanne])).toEqual([["413", false], ["412", true]]);
    expect(await fermerLot(officier, lot.id)).toMatchObject({ ok: false, message: expect.stringContaining("1 acte(s) de ce lot n'ont pas encore leur scan") });

    const page2 = await assemblerPdf([{ genre: "pdf", source: 0, page: 1, rotation: 0 }], [REGISTRE]);
    expect(await joindre(r2.acte.id, page2)).toEqual({ ok: true, version: 1, pages: 1 });
    expect((await lireScans(officier, r2.acte.id))[0]).toMatchObject({ mode_import: "lot", chemin_stockage: `KAL/${annee}/${r2.acte.identifiant}.pdf` });

    // La recherche trouve un ancien acte par son nom
    expect(await rechercherActes(officier, { texte: "furaha espoir", typeActeId: null, annee, statut: null }, "KAL")).toMatchObject({
      etat: "trouve", resultats: [{ identifiant: r1.acte.identifiant, numeroRegistre: "412", statut: "delivre" }],
    });

    // Tout est scanné : fermeture ; plus aucun acte ensuite
    expect(await fermerLot(officier, lot.id)).toEqual({ ok: true });
    expect((await lireLots(officier)).find((l) => l.id === lot.id)).toMatchObject({ statut: "ferme", nb_actes: 2, nb_scannes: 2 });
    expect(await ajouterActeAncien(officier, lot.id, { titulaire: "Tardif", titulaire2: "", date: `${annee}-12-01`, numero: "999" })).toMatchObject({
      ok: false, message: "Ce lot est fermé : il n'accepte plus d'actes.",
    });
  });
});
