// Fichier 34 — photos par téléphone, contre le banc (vrai Supabase : Auth, PostgREST, Storage ; migration 22)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe } from "./actes";
import { assemblerPdf, empreinteSha256 } from "./archivage";
import { connecterAgent } from "./connexion";
import { envoyerScan } from "./envoi-reprenable";
import { lireTypeParCode } from "./nouvel-acte";
import { cheminPrevu, enregistrerScan } from "./scans";
import { aujourdhuiUvira } from "./tarifs";
import { lireEntite } from "./tarifs-entite";
import { enregistrerTaux } from "./taux";
import { creerTransfert, envoyerPage, lireTransfert, recupererPages, terminerEnvoi } from "./transfert-photo";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});
const client = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
async function agent(role: "officier" | "caissier") {
  const a = await creerAgent({ role, entite: "KAL" });
  const c = client();
  await connecterAgent(c, { nom: a.nom, motDePasse: a.motDePasse });
  return c;
}
const JPEG = new Uint8Array(readFileSync(new URL("../test/fichiers/acte-page1.jpg", import.meta.url)));

describe("Photos par téléphone (Kalundu)", () => {
  it("QR code → téléphone SANS session → pages reprises par l'ordinateur → archivage en mode « photo »", async () => {
    const officier = await agent("officier");
    const caissier = await agent("caissier");
    const kal = (await lireEntite(officier, "KAL"))!;
    expect((await enregistrerTaux(caissier, kal.id, "2850")).ok).toBe(true);
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const r = await enregistrerActe(officier, {
      typeActeId: atidc.id, categorie: "national", titulaire: "Bisimwa Paul", titulaire2: "", demandeur: "", telephone: "", observations: "", details: {},
    }, true, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    // Pas encore payé : pas de QR code
    expect(await creerTransfert(officier, r.acte.id)).toMatchObject({ ok: false, message: expect.stringContaining("pas encore payé") });
    expect((await caissier.rpc("encaisser", { p_acte: r.acte.id, p_devise_recue: "CDF" })).error).toBeNull(); // acte en francs : payé en francs (migration 24)

    // Ordinateur : le lien
    const cree = await creerTransfert(officier, r.acte.id);
    if (!cree.ok) throw new Error(cree.message);
    const { transfert } = cree;
    expect(await creerTransfert(caissier, r.acte.id)).toMatchObject({ ok: false, message: expect.stringContaining("Seul l'Officier") });

    // Téléphone : aucune session, seulement la clé publique et le secret
    const telephone = client();
    expect(await lireTransfert(telephone, transfert.secret)).toMatchObject({
      ok: true, acte: { identifiant: r.acte.identifiant, titulaire: "Bisimwa Paul", pages: 0, termine: false },
    });
    expect(await lireTransfert(telephone, transfert.secret.replace(/^./, (c) => (c === "A" ? "B" : "A")))).toMatchObject({
      ok: false, message: expect.stringContaining("plus valable"),
    });
    expect(await envoyerPage(telephone, transfert.secret, { jpeg: JPEG, largeur: 620, hauteur: 877 })).toEqual({ ok: true, numero: 1 });
    expect(await envoyerPage(telephone, transfert.secret, { jpeg: new TextEncoder().encode("pas une photo"), largeur: 620, hauteur: 877 })).toMatchObject({ ok: false });
    expect((await telephone.rpc("recuperer_pages_photo", { p_transfert: transfert.id })).error?.message).toContain("permission denied");

    // Ordinateur : la page arrive intacte, puis n'est plus dans la base
    const recu = await recupererPages(officier, transfert.id);
    expect(recu.pages.map((p) => [p.numero, p.largeur, p.hauteur])).toEqual([[1, 620, 877]]);
    expect(await empreinteSha256(recu.pages[0].jpeg)).toBe(await empreinteSha256(JPEG));
    expect((await recupererPages(officier, transfert.id)).pages).toEqual([]);
    expect(sql(`select count(*) from public.pages_photo`)).toBe("0");

    // Téléphone : « J'ai terminé » ; plus rien n'est accepté
    expect(await terminerEnvoi(telephone, transfert.secret)).toEqual({ ok: true });
    expect(await envoyerPage(telephone, transfert.secret, { jpeg: JPEG, largeur: 620, hauteur: 877 })).toMatchObject({ ok: false, message: expect.stringContaining("déjà terminé") });
    expect(await recupererPages(officier, transfert.id)).toMatchObject({ termine: true, expire: false });

    // Ordinateur : un seul PDF, envoyé puis archivé en mode « photo »
    const pdf = await assemblerPdf([{ genre: "image", source: 0, largeur: 620, hauteur: 877, rotation: 0, photo: true }], [recu.pages[0].jpeg]);
    const jeton = (await officier.auth.getSession()).data.session!.access_token;
    await envoyerScan({ url: banc.url, clePublique: banc.clePublique, jeton, chemin: await cheminPrevu(officier, r.acte.id), octets: pdf, empreinte: await empreinteSha256(pdf) });
    expect(await enregistrerScan(officier, { acteId: r.acte.id, motif: null, mode: "photo" })).toEqual({ ok: true, version: 1, pages: 1 });
    expect(sql(`select mode_import from public.documents_scannes where acte_id = '${r.acte.id}'`)).toBe("photo");

    // Le secret n'est gardé nulle part en clair
    expect(sql(`select count(*) from public.transferts_photo where empreinte_secret like '%${transfert.secret.slice(0, 10)}%'`)).toBe("0");
  });
});
