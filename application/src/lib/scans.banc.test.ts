// Fichier 33 — archiver un acte par fichier, contre le banc (vrai Supabase : Auth, PostgREST, Storage ; migration 21)
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe, type SaisieActe } from "./actes";
import { assemblerPdf, empreinteSha256 } from "./archivage";
import { connecterAgent } from "./connexion";
import { envoyerScan } from "./envoi-reprenable";
import { lireTypeParCode } from "./nouvel-acte";
import { cheminPrevu, enregistrerScan, lienConsultation, lireScans, verifierEmpreinte } from "./scans";
import { aujourdhuiUvira } from "./tarifs";
import { lireEntite } from "./tarifs-entite";
import { enregistrerTaux } from "./taux";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

async function agent(role: "officier" | "caissier", entite: "KAL" | "KAV") {
  const a = await creerAgent({ role, entite, nomComplet: role === "officier" ? "Espoir Furaha" : "Grace Mapendo" });
  const client = createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
  await connecterAgent(client, { nom: a.nom, motDePasse: a.motDePasse });
  return client;
}
const jeton = async (c: SupabaseClient) => (await c.auth.getSession()).data.session!.access_token;
const fichier = (nom: string) => new Uint8Array(readFileSync(new URL(`../test/fichiers/${nom}`, import.meta.url)));
const photo = (n: number) => assemblerPdf([{ genre: "image", source: 0, largeur: 620 + n, hauteur: 877, rotation: 0 }], [fichier("acte-page1.jpg")]);

async function envoyer(officier: SupabaseClient, acteId: string, octets: Uint8Array, chemin?: string, progression?: number[]) {
  await envoyerScan({
    url: banc.url, clePublique: banc.clePublique, jeton: await jeton(officier), chemin: chemin ?? (await cheminPrevu(officier, acteId)),
    octets, empreinte: await empreinteSha256(octets), surProgression: (e) => progression?.push(e),
  });
}

describe("Archiver par fichier (Kalundu)", () => {
  it("envoi reprenable, enregistrement relu par le serveur, doublons, envoi repris, refaire le scan, consultation", async () => {
    const officier = await agent("officier", "KAL");
    const caissier = await agent("caissier", "KAL");
    const kal = (await lireEntite(officier, "KAL"))!;
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    expect((await enregistrerTaux(caissier, kal.id, "2850")).ok).toBe(true);
    const nouvelActe = async (nom: string, payer: boolean) => {
      const saisie: SaisieActe = { typeActeId: atidc.id, categorie: "national", titulaire: nom, titulaire2: "", demandeur: "", telephone: "", observations: "", details: {} };
      const r = await enregistrerActe(officier, saisie, true, aujourdhuiUvira());
      if (!r.ok) throw new Error(r.message);
      if (payer) expect((await caissier.rpc("encaisser", { p_acte: r.acte.id, p_devise_recue: "CDF" })).error).toBeNull(); // acte en francs : payé en francs (migration 24)
      return r.acte;
    };
    const p = await nouvelActe("Bisimwa Paul", true);
    const q = await nouvelActe("Mapendo Grace", true);
    const u = await nouvelActe("Kahindo Aline", false);

    // Acte pas encore payé : le dépôt est refusé par la base
    await expect(envoyer(officier, u.id, await photo(0), `KAL/${u.identifiant.split("-")[2]}/${u.identifiant}.pdf`)).rejects.toThrow("Le dépôt a été refusé");

    // P : photo + PDF de 2 pages réunis, envoyés, enregistrés (version 1, 3 pages)
    const pdf = await assemblerPdf(
      [{ genre: "image", source: 1, largeur: 620, hauteur: 877, rotation: 0 }, { genre: "pdf", source: 0, page: 0, rotation: 90 }, { genre: "pdf", source: 0, page: 1, rotation: 0 }],
      [fichier("registre-2-pages.pdf"), fichier("acte-page1.jpg")],
    );
    const empreinte = await empreinteSha256(pdf);
    expect(await cheminPrevu(officier, p.id)).toBe(`KAL/${p.identifiant.split("-")[2]}/${p.identifiant}.pdf`);
    expect(await verifierEmpreinte(officier, p.id, empreinte)).toBeNull();
    await envoyer(officier, p.id, pdf);
    expect(await enregistrerScan(officier, { acteId: p.id, motif: null, mode: "fichier" })).toEqual({ ok: true, version: 1, pages: 3 });
    expect(await lireScans(officier, p.id)).toMatchObject([{ version: 1, nb_pages: 3, taille_octets: pdf.length, mode_import: "fichier", motif_remplacement: null }]);
    expect(sql(`select empreinte_sha256 from documents_scannes where acte_id = '${p.id}'`)).toBe(empreinte);

    // Le fichier archivé ne peut plus être remplacé
    await expect(envoyer(officier, p.id, await photo(1), `KAL/${p.identifiant.split("-")[2]}/${p.identifiant}.pdf`)).rejects.toThrow("Le dépôt a été refusé");

    // Le même fichier pour Q : prévenu avant l'envoi, refusé à l'enregistrement
    expect(await verifierEmpreinte(officier, q.id, empreinte)).toBe(
      `Ce fichier est déjà enregistré pour l'acte ${p.identifiant}. Vérifiez que vous avez scanné le bon document.`);
    await envoyer(officier, q.id, pdf);
    expect(await enregistrerScan(officier, { acteId: q.id, motif: null, mode: "fichier" })).toEqual({
      ok: false, message: `Ce fichier est déjà enregistré pour l'acte ${p.identifiant}. Vérifiez que vous avez scanné le bon document.`,
    });
    // … le bon fichier est envoyé au même emplacement (envoi repris), puis enregistré
    const bon = await photo(2);
    await envoyer(officier, q.id, bon);
    expect(await enregistrerScan(officier, { acteId: q.id, motif: null, mode: "fichier" })).toMatchObject({ ok: true, version: 1, pages: 1 });

    // Refaire le scan de P : motif obligatoire, version 2 ; un gros fichier part en plusieurs morceaux
    expect(await enregistrerScan(officier, { acteId: p.id, motif: "", mode: "fichier" })).toMatchObject({ ok: false, champ: "motif" });
    const gros = await PDFDocument.create({ updateMetadata: false });
    gros.addPage();
    const remplissage = new Uint8Array(8 * 1024 * 1024);
    for (let i = 0; i < remplissage.length; i += 65536) globalThis.crypto.getRandomValues(remplissage.subarray(i, i + 65536));
    await gros.attach(remplissage, "annexe.bin");
    const grosPdf = await gros.save();
    const progression: number[] = [];
    await envoyer(officier, p.id, grosPdf, undefined, progression);
    expect(Math.max(...progression)).toBe(grosPdf.length);
    expect(await enregistrerScan(officier, { acteId: p.id, motif: "Page 2 illisible", mode: "fichier" })).toEqual({ ok: true, version: 2, pages: 1 });
    expect((await lireScans(officier, p.id)).map((v) => [v.version, v.motif_remplacement, v.chemin_stockage.endsWith("-v2.pdf")])).toEqual([
      [2, "Page 2 illisible", true], [1, null, false],
    ]);

    // Consultation : lien de 5 minutes pour le Caissier ; rien pour une autre entité
    const [v2] = await lireScans(caissier, p.id);
    const lien = await lienConsultation(caissier, v2.chemin_stockage);
    expect(lien).toContain("/storage/v1/object/sign/archives/");
    const lu = new Uint8Array(await (await fetch(lien!)).arrayBuffer());
    expect(await empreinteSha256(lu)).toBe(await empreinteSha256(grosPdf));
    expect(await enregistrerScan(caissier, { acteId: q.id, motif: "Essai du caissier", mode: "fichier" })).toMatchObject({ ok: false });
    const autre = await agent("officier", "KAV");
    expect(await lireScans(autre, p.id)).toEqual([]);
    expect(await lienConsultation(autre, v2.chemin_stockage)).toBeNull();
  });
});
