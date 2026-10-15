// Fichier 39 — reçu A5 : contenu, mentions, PDF (format, texte, QR, reproductible)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { A5, couperLignes, creerRecuPdf, textePdf } from "./recu-pdf";
import { RECU } from "@/test/recu-exemple";
import { adresseVerification, enTeteRecu, etatImpressions, lignesRecu, mentionImpression, montantPayeEnLettres } from "./recus";

const n = (s: string) => s.replace(/[  ]/g, " ");

describe("Contenu du reçu (maquette)", () => {
  it("en-tête : ville pour une commune, territoire pour la chefferie", () => {
    expect(enTeteRecu(RECU.entite)).toEqual(["République Démocratique du Congo", "Province du Sud-Kivu · Ville d'Uvira", "Commune de Mulongwe", "Bureau de l'État-Civil"]);
    expect(enTeteRecu({ nom: "Chefferie des Bavira", type: "chefferie", ville: "Uvira", province: "Sud-Kivu" })[1]).toBe("Province du Sud-Kivu · Territoire d'Uvira");
  });
  it("lignes dans l'ordre de la maquette ; sans demandeur ni taux quand il n'y en a pas", () => {
    expect(lignesRecu(RECU).map(([c, v]) => `${c} : ${n(v)}`)).toEqual([
      "Acte : Extrait d'acte de naissance", "ID de l'acte : MUL-EXNAIS-2026-000124", "Titulaire : Mapendo Grace", "Demandeur : Mapendo Joseph",
      "Catégorie : National", "Montant dû (grille 2026) : 30 $", "Taux appliqué : 2 850 FC pour 1 $", "Mode de paiement : Espèces",
    ]);
    const fc = { ...RECU, montantDu: 18000, deviseDu: "CDF" as const, tauxApplique: null, acte: { ...RECU.acte, demandeur: null } };
    expect(lignesRecu(fc).map(([c]) => c)).toEqual(["Acte", "ID de l'acte", "Titulaire", "Catégorie", "Montant dû (grille 2026)", "Mode de paiement"]);
    expect(montantPayeEnLettres(RECU)).toBe("Quatre-vingt-cinq mille cinq cents francs congolais.");
  });
  it("original puis duplicatas ; état des impressions ; adresse du QR", () => {
    expect(mentionImpression(1)).toBeNull();
    expect(mentionImpression(null)).toBeNull();
    expect(mentionImpression(2)).toBe("DUPLICATA n° 2");
    expect(etatImpressions(0)).toBe("Pas encore imprimé : la prochaine impression sera l'original.");
    expect(etatImpressions(2)).toBe("Imprimé 2 fois : la prochaine impression portera « DUPLICATA n° 3 ».");
    expect(adresseVerification("https://etatcivil.cdjp.cd/", RECU.jeton)).toBe("https://etatcivil.cdjp.cd/verifier/0123456789abcdef0123456789abcdef");
  });
});

describe("Reçu en PDF", () => {
  const texte = (octets: Uint8Array) => {
    const dossier = mkdtempSync(join(tmpdir(), "recu-"));
    const chemin = join(dossier, "recu.pdf");
    writeFileSync(chemin, octets);
    return execFileSync("pdftotext", ["-raw", chemin, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  };

  it("une page A5 ; tout le contenu ; reproductible", async () => {
    const options = { adresseQr: adresseVerification("http://localhost:3000", RECU.jeton), mention: null };
    const octets = await creerRecuPdf(RECU, options);
    const doc = await PDFDocument.load(octets);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([Math.round(A5.largeur), Math.round(A5.hauteur)]);
    const t = texte(octets);
    for (const attendu of [
      "RÉPUBLIQUE DÉMOCRATIQUE DU CONGO", "Province du Sud-Kivu · Ville d'Uvira", "Commune de Mulongwe", "Bureau de l'État-Civil",
      "REÇU DE PAIEMENT", "MUL-REC-2026-000845", "13/10/2026 à 08 h 29", "MUL-EXNAIS-2026-000124", "Mapendo Grace", "Mapendo Joseph",
      "Montant dû (grille 2026)", "30 $", "2 850 FC pour 1 $", "Espèces", "Montant payé", "85 500 FC",
      "Quatre-vingt-cinq mille cinq cents francs congolais.", "Neema Furaha", "Cachet du bureau", "Vérifier ce reçu",
    ]) expect(t).toContain(attendu);
    expect(t).not.toContain("DUPLICATA");
    expect(t.split("ANNULÉ").length - 1).toBe(1); // seulement dans la mention de bas de page
    // Même reçu, même PDF (aucune date variable)
    expect(Buffer.from(await creerRecuPdf(RECU, options)).equals(Buffer.from(octets))).toBe(true);
  });

  it("duplicata et reçu annulé : mentions visibles", async () => {
    const t = texte(await creerRecuPdf({ ...RECU, statut: "annule", motifAnnulation: "erreur de type" }, { adresseQr: "http://x/verifier/a", mention: "DUPLICATA n° 2" }));
    expect(t).toContain("DUPLICATA n° 2");
    expect(t.split("ANNULÉ").length - 1).toBe(2); // mention + tampon en travers
  });

  it("texte coupé à la largeur ; espaces fines remplacées", async () => {
    const doc = await PDFDocument.create();
    const police = await doc.embedFont("Helvetica");
    const lignes = couperLignes("un deux trois quatre cinq six sept huit neuf dix", police, 10, 60);
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.every((l) => police.widthOfTextAtSize(l, 10) <= 60 || !l.includes(" "))).toBe(true);
    expect(textePdf("85 500 FC")).toBe("85 500 FC");
  });
});
