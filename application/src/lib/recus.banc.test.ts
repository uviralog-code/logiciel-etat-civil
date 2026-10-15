// Fichier 39 — reçus contre le banc (Kavimvira ; Bavira est réservée aux comptes exacts de l'accueil de l'officier) : lecture complète, impressions comptées, vérification publique sans connexion
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { enregistrerActe, type SaisieActe } from "./actes";
import { connecterAgent } from "./connexion";
import { encaisserActe } from "./encaissement";
import { lireTypeParCode } from "./nouvel-acte";
import { creerRecuPdf } from "./recu-pdf";
import { adresseVerification, enregistrerImpression, lireRecu, mentionImpression, verifierRecu } from "./recus";
import { aujourdhuiUvira } from "./tarifs";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

const client = () => createClient(banc.url, banc.clePublique, { auth: { persistSession: false, autoRefreshToken: false } });
async function agent(role: "officier" | "caissier", entite: "BAV" | "KAV", nomComplet: string) {
  const a = await creerAgent({ role, entite, nomComplet });
  const c = client();
  await connecterAgent(c, { nom: a.nom, motDePasse: a.motDePasse });
  return c;
}

describe("Reçus (Kavimvira)", () => {
  it("reçu complet ; original puis duplicatas ; QR : vérification sans connexion, puis « annulé »", async () => {
    const officier = await agent("officier", "KAV", "Bisimwa Officier");
    const caissier = await agent("caissier", "KAV", "Zawadi Caissière");
    const autreCaissier = await agent("caissier", "BAV", "Autre Caissier");
    const atidc = (await lireTypeParCode(officier, "ATIDC"))!;
    const saisie: SaisieActe = { typeActeId: atidc.id, categorie: "national", titulaire: "Furaha Neema", titulaire2: "", demandeur: "Furaha Paul", telephone: "", observations: "", details: {} };
    const r = await enregistrerActe(officier, saisie, true, aujourdhuiUvira());
    if (!r.ok) throw new Error(r.message);
    const e = await encaisserActe(caissier, r.acte.id, "CDF", Number(r.acte.montant_du));
    if (!e.ok) throw new Error(e.message);

    const recu = (await lireRecu(caissier, e.recu.id))!;
    expect(recu).toMatchObject({
      numero: e.recu.numero, statut: "valide", impressions: 0, caissier: "Zawadi Caissière", deviseRecue: "CDF", tauxApplique: null,
      entite: { nom: "Commune de Kavimvira", type: "commune", ville: "Uvira", province: "Sud-Kivu" },
      acte: { identifiant: r.acte.identifiant, titulaire: "Furaha Neema", demandeur: "Furaha Paul" },
    });
    expect(recu.jeton).toMatch(/^[0-9a-f]{32}$/);
    expect(await lireRecu(autreCaissier, e.recu.id)).toBeNull();

    // Impressions : 1 (original), 2 (PDF : duplicata) ; un autre caissier ne peut pas
    expect(await enregistrerImpression(caissier, recu.id, "impression")).toEqual({ ok: true, numero: 1 });
    expect(await enregistrerImpression(caissier, recu.id, "pdf")).toEqual({ ok: true, numero: 2 });
    expect(await enregistrerImpression(autreCaissier, recu.id, "impression")).toEqual({ ok: false, message: "Reçu introuvable." });
    expect(await enregistrerImpression(officier, recu.id, "impression")).toMatchObject({ ok: false });
    expect((await lireRecu(caissier, recu.id))!.impressions).toBe(2);
    expect(sql(`select string_agg(numero || ':' || forme, ',' order by numero) from public.impressions_recus where recu_id = '${recu.id}'`)).toBe("1:impression,2:pdf");
    expect(mentionImpression(3)).toBe("DUPLICATA n° 3");

    // Le PDF se fabrique avec les vraies données
    expect((await creerRecuPdf(recu, { adresseQr: adresseVerification("http://localhost:3000", recu.jeton), mention: null })).length).toBeGreaterThan(2000);

    // QR : sans connexion, le reçu est vérifiable — sans aucun nom
    const anonyme = client();
    const verifie = await verifierRecu(anonyme, recu.jeton);
    expect(verifie).toMatchObject({ numero: recu.numero, entite: "Commune de Kavimvira", typeActe: atidc.libelle, statut: "valide", devise: "CDF", annuleLe: null });
    expect(JSON.stringify(verifie)).not.toMatch(/Furaha|Zawadi|Bisimwa/);
    expect(await verifierRecu(anonyme, "0".repeat(32))).toBeNull();
    expect(await verifierRecu(anonyme, "pas-un-jeton")).toBeNull();
    expect((await anonyme.from("recus").select("id")).error).not.toBeNull();

    // Après annulation, le même QR dit « annulé »
    expect((await caissier.rpc("annuler_recu", { p_recu: recu.id, p_motif: "erreur de nom" })).error).toBeNull();
    expect(await verifierRecu(anonyme, recu.jeton)).toMatchObject({ statut: "annule", annuleLe: expect.any(String) });
  });
});
