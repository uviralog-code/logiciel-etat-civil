/**
 * REÇU EN PDF (fichier 39) — format A5, même contenu que la page imprimée
 * (maquette « Caissier — Reçu »), avec le QR code de vérification et, à
 * partir de la 2e impression, la mention « DUPLICATA n° N ».
 *
 * Polices standard du PDF (Helvetica, Courier) : aucun fichier à embarquer.
 * Le PDF est reproductible : aucune date de création ni métadonnée variable.
 */
import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import {
  dateRecu,
  enTeteRecu,
  lignesRecu,
  MENTION_RECU,
  montantPayeEnLettres,
  montantPayeRecu,
  type RecuDetaille,
} from "./recus";

/** A5 portrait, en points (148 × 210 mm). */
export const A5 = { largeur: 419.53, hauteur: 595.28 } as const;
const MARGE = 30;
const ENCRE = rgb(0.067, 0.067, 0.067);
const GRIS = rgb(0.216, 0.255, 0.318);
const BLEU = rgb(0.043, 0.239, 0.569);
const ROUGE = rgb(0.706, 0.137, 0.094);

/** Les polices standard du PDF ne connaissent pas les espaces fines de la mise en forme française. */
export const textePdf = (t: string) => t.replace(/[  ]/g, " ");

/** Coupe un texte en lignes qui tiennent dans la largeur donnée. */
export function couperLignes(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  let ligne = "";
  // « et » restent collés au mot qu'ils entourent
  const mots = textePdf(texte)
    .split(/\s+/)
    .reduce<string[]>((liste, mot) => {
      const precedent = liste[liste.length - 1];
      if (precedent === "«") liste[liste.length - 1] = `« ${mot}`;
      else if (mot === "»" && precedent) liste[liste.length - 1] = `${precedent} »`;
      else liste.push(mot);
      return liste;
    }, []);
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeur || !ligne) ligne = essai;
    else {
      lignes.push(ligne);
      ligne = mot;
    }
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

function centrer(page: PDFPage, texte: string, police: PDFFont, taille: number, y: number, couleur = ENCRE) {
  const t = textePdf(texte);
  page.drawText(t, { x: (A5.largeur - police.widthOfTextAtSize(t, taille)) / 2, y, size: taille, font: police, color: couleur });
}

/** QR code dessiné module par module (net à toute taille d'impression). */
function dessinerQr(page: PDFPage, adresse: string, x: number, y: number, cote: number) {
  const { modules } = QRCode.create(adresse, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const m = cote / n;
  for (let ligne = 0; ligne < n; ligne++) {
    for (let col = 0; col < n; col++) {
      if (modules.get(ligne, col)) page.drawRectangle({ x: x + col * m, y: y + cote - (ligne + 1) * m, width: m + 0.05, height: m + 0.05, color: ENCRE });
    }
  }
}

export async function creerRecuPdf(recu: RecuDetaille, options: { adresseQr: string; mention: string | null }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Reçu ${recu.numero}`);
  doc.setCreator("Logiciel d'état civil — CDJP/Bukavu");
  doc.setProducer("Logiciel d'état civil");
  const fixe = new Date(0);
  doc.setCreationDate(fixe);
  doc.setModificationDate(fixe);

  const page = doc.addPage([A5.largeur, A5.hauteur]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const italique = await doc.embedFont(StandardFonts.HelveticaOblique);
  const chasse = await doc.embedFont(StandardFonts.CourierBold);
  const largeurUtile = A5.largeur - 2 * MARGE;
  let y = A5.hauteur - MARGE - 10;

  // En-tête officiel
  const [pays, lieu, entite, bureau] = enTeteRecu(recu.entite);
  centrer(page, pays.toUpperCase(), gras, 9.5, y);
  y -= 13;
  centrer(page, lieu, normal, 9, y, GRIS);
  y -= 15;
  centrer(page, entite, gras, 12, y);
  y -= 13;
  centrer(page, bureau, normal, 9.5, y, GRIS);
  y -= 12;
  page.drawLine({ start: { x: MARGE, y }, end: { x: A5.largeur - MARGE, y }, thickness: 1.5, color: ENCRE });
  y -= 26;

  // Titre, date, numéro
  page.drawText("REÇU DE PAIEMENT", { x: MARGE, y, size: 15, font: gras, color: ENCRE });
  const numero = textePdf(recu.numero);
  const tailleNumero = 11.5;
  page.drawText(numero, { x: A5.largeur - MARGE - chasse.widthOfTextAtSize(numero, tailleNumero), y: y + 1, size: tailleNumero, font: chasse, color: ENCRE });
  y -= 15;
  page.drawText(textePdf(dateRecu(recu)), { x: MARGE, y, size: 9.5, font: normal, color: GRIS });
  if (options.mention) {
    const m = textePdf(options.mention);
    const l = gras.widthOfTextAtSize(m, 9.5) + 12;
    page.drawRectangle({ x: A5.largeur - MARGE - l, y: y - 4, width: l, height: 15, borderColor: ROUGE, borderWidth: 1.2 });
    page.drawText(m, { x: A5.largeur - MARGE - l + 6, y, size: 9.5, font: gras, color: ROUGE });
  }
  y -= 18;

  // Lignes pointillées
  for (const [cle, valeur] of lignesRecu(recu)) {
    const taille = 9.5;
    const police = cle === "ID de l'acte" ? chasse : gras;
    const largeurCle = normal.widthOfTextAtSize(textePdf(cle), taille) + 12;
    const morceaux = couperLignes(valeur, police, taille, largeurUtile - largeurCle);
    morceaux.forEach((morceau, i) => {
      if (i === 0) page.drawText(textePdf(cle), { x: MARGE, y, size: taille, font: normal, color: GRIS });
      page.drawText(morceau, { x: A5.largeur - MARGE - police.widthOfTextAtSize(morceau, taille), y, size: taille, font: police, color: ENCRE });
      if (i < morceaux.length - 1) y -= 12;
    });
    y -= 6;
    page.drawLine({ start: { x: MARGE, y }, end: { x: A5.largeur - MARGE, y }, thickness: 0.6, color: rgb(0.6, 0.64, 0.69), dashArray: [1.2, 2] });
    y -= 13;
  }

  // Montant payé
  y -= 4;
  page.drawRectangle({ x: MARGE, y: y - 14, width: largeurUtile, height: 34, borderColor: BLEU, borderWidth: 1.6 });
  page.drawText("Montant payé", { x: MARGE + 10, y: y - 2, size: 11, font: gras, color: BLEU });
  const paye = textePdf(montantPayeRecu(recu));
  page.drawText(paye, { x: A5.largeur - MARGE - 10 - gras.widthOfTextAtSize(paye, 18), y: y - 5, size: 18, font: gras, color: BLEU });
  y -= 32;
  for (const l of couperLignes(montantPayeEnLettres(recu), italique, 9.5, largeurUtile)) {
    page.drawText(l, { x: MARGE, y, size: 9.5, font: italique, color: ENCRE });
    y -= 12;
  }
  y -= 14;

  // Caissier, signature, cachet
  page.drawText("Le Caissier", { x: MARGE, y, size: 9, font: normal, color: GRIS });
  page.drawText(textePdf(recu.caissier ?? "—"), { x: MARGE, y: y - 13, size: 10.5, font: gras, color: ENCRE });
  page.drawLine({ start: { x: MARGE, y: y - 42 }, end: { x: MARGE + 150, y: y - 42 }, thickness: 0.6, color: GRIS });
  page.drawText("Signature", { x: MARGE, y: y - 53, size: 8.5, font: normal, color: GRIS });
  const cachet = { x: A5.largeur - MARGE - 120, y: y - 58, l: 120, h: 66 };
  page.drawRectangle({ x: cachet.x, y: cachet.y, width: cachet.l, height: cachet.h, borderColor: rgb(0.6, 0.64, 0.69), borderWidth: 0.8, borderDashArray: [3, 3] });
  page.drawText("Cachet du bureau", {
    x: cachet.x + (cachet.l - normal.widthOfTextAtSize("Cachet du bureau", 8.5)) / 2, y: cachet.y + cachet.h / 2 - 3, size: 8.5, font: normal, color: GRIS,
  });

  // Pied : QR code de vérification et mention
  const coteQr = 64;
  const basQr = MARGE;
  page.drawLine({ start: { x: MARGE, y: basQr + coteQr + 10 }, end: { x: A5.largeur - MARGE, y: basQr + coteQr + 10 }, thickness: 0.6, color: rgb(0.6, 0.64, 0.69) });
  dessinerQr(page, options.adresseQr, MARGE, basQr, coteQr);
  let yMention = basQr + coteQr - 8;
  page.drawText("Vérifier ce reçu : scannez le code", { x: MARGE + coteQr + 12, y: yMention, size: 8.5, font: gras, color: ENCRE });
  yMention -= 11;
  for (const l of couperLignes(MENTION_RECU, normal, 7.5, largeurUtile - coteQr - 12)) {
    page.drawText(l, { x: MARGE + coteQr + 12, y: yMention, size: 7.5, font: normal, color: GRIS });
    yMention -= 9.5;
  }

  // Reçu annulé : tampon en travers
  if (recu.statut === "annule") {
    const t = "ANNULÉ";
    const taille = 84;
    const l = gras.widthOfTextAtSize(t, taille);
    page.drawText(t, {
      x: A5.largeur / 2 - (l / 2) * Math.cos(Math.PI / 6) + 10, y: A5.hauteur / 2 - (l / 2) * Math.sin(Math.PI / 6),
      size: taille, font: gras, color: ROUGE, opacity: 0.35, rotate: degrees(30),
    });
  }

  return doc.save({ useObjectStreams: false });
}
