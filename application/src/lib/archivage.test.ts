// @vitest-environment node
// Fichier 33 — archivage : contrôles des fichiers, un seul PDF reproductible, empreinte, relecture
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  assemblerPdf, controlerFichier, empreinteSha256, formaterTaille, genreDuFichier, lireMotifRemplacement, modeImport,
  pivoter, relirePdf, TAILLE_MAXIMUM, verificationsAvantArchivage, type PageSource,
} from "./archivage";

const fichier = (nom: string) => new Uint8Array(readFileSync(new URL(`../test/fichiers/${nom}`, import.meta.url)));
const JPEG = fichier("acte-page1.jpg");
const PNG = fichier("acte-page2.png");
const PDF2 = fichier("registre-2-pages.pdf");

describe("Contrôle des fichiers choisis", () => {
  it("le format se lit dans le contenu, pas dans le nom", () => {
    expect([genreDuFichier(JPEG), genreDuFichier(PNG), genreDuFichier(PDF2), genreDuFichier(fichier("pas-une-image.jpg"))]).toEqual(["jpeg", "png", "pdf", null]);
  });

  it.each([
    [{ nom: "acte.jpg", taille: 32_000, debut: JPEG }, { ok: true, genre: "jpeg" }],
    [{ nom: "faux.jpg", taille: 32, debut: fichier("pas-une-image.jpg") }, { ok: false, message: "« faux.jpg » n'est ni un PDF, ni une photo JPEG ou PNG." }],
    [{ nom: "vide.pdf", taille: 0, debut: new Uint8Array() }, { ok: false, message: "« vide.pdf » est vide." }],
    [{ nom: "gros.pdf", taille: TAILLE_MAXIMUM + 1, debut: PDF2 }, { ok: false, message: "« gros.pdf » est trop lourd (15 Mo) : 15 Mo au plus." }],
  ] as const)("%o", (f, attendu) => expect(controlerFichier(f)).toEqual(attendu));

  it("tailles affichées", () => {
    expect([formaterTaille(300), formaterTaille(215_000), formaterTaille(1_468_006)].map((t) => t.replace(/ | /g, " "))).toEqual(["1 Ko", "210 Ko", "1,4 Mo"]);
  });
});

describe("Un seul PDF", () => {
  const p = (page: number, rotation: PageSource["rotation"] = 0): PageSource => ({ genre: "pdf", source: 0, page, rotation });
  const img = (source: number, rotation: PageSource["rotation"] = 0): PageSource => ({ genre: "image", source, largeur: 620, hauteur: 877, rotation });
  const ouvrir = (o: Uint8Array) => PDFDocument.load(o, { updateMetadata: false });

  it("un PDF choisi tel quel est gardé sans aucun changement (même empreinte)", async () => {
    const sortie = await assemblerPdf([p(0), p(1)], [PDF2]);
    expect(sortie).toBe(PDF2);
  });

  it("photos + pages de PDF, rotation, ordre choisi ; pages au format de la photo (200 points par pouce)", async () => {
    const sortie = await assemblerPdf([img(1), p(1, 90), img(1, 270)], [PDF2, JPEG]);
    const doc = await ouvrir(sortie);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((pg) => pg.getRotation().angle)).toEqual([0, 90, 270]);
    expect(doc.getPage(0).getSize()).toEqual({ width: 620 * 0.36, height: 877 * 0.36 });
    // Ni date ni logiciel inscrits : le fichier ne dépend que des pages
    expect([doc.getCreationDate(), doc.getModificationDate(), doc.getProducer()]).toEqual([undefined, undefined, undefined]);
  });

  it("reproductible : les mêmes pages donnent exactement le même fichier", async () => {
    const a = await assemblerPdf([img(0), img(0, 90)], [JPEG]);
    await new Promise((r) => setTimeout(r, 1100));
    const b = await assemblerPdf([img(0), img(0, 90)], [JPEG]);
    expect(await empreinteSha256(a)).toBe(await empreinteSha256(b));
    expect(await empreinteSha256(await assemblerPdf([img(0)], [JPEG]))).not.toBe(await empreinteSha256(a));
  });

  it("aucune page, ou trop de pages : refus", async () => {
    await expect(assemblerPdf([], [])).rejects.toThrow("Aucune page à archiver.");
    await expect(assemblerPdf(Array.from({ length: 501 }, () => img(0)), [JPEG])).rejects.toThrow("Trop de pages (501) : 500 au plus.");
  });

  it("pivoter : un quart de tour à chaque appui", () => {
    expect([pivoter(0), pivoter(90), pivoter(180), pivoter(270)]).toEqual([90, 180, 270, 0]);
  });
});

describe("Empreinte et relecture du fichier déposé", () => {
  it("SHA-256 en hexadécimal", async () => {
    expect(await empreinteSha256(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("PDF lisible : nombre de pages ; sinon message clair", async () => {
    expect(await relirePdf(PDF2)).toEqual({ ok: true, pages: 2 });
    expect(await relirePdf(JPEG)).toEqual({ ok: false, message: "Le fichier déposé n'est pas un PDF." });
    expect(await relirePdf(new Uint8Array())).toEqual({ ok: false, message: "Le fichier déposé est vide." });
    expect(await relirePdf(new TextEncoder().encode("%PDF-1.7 abîmé"))).toEqual({ ok: false, message: "Ce PDF est abîmé ou illisible : il ne peut pas être archivé." });
  });

  it("PDF protégé par un mot de passe : refusé", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: PDFName.of("Standard"), V: 2, R: 3 }));
    expect(await relirePdf(await doc.save())).toMatchObject({ ok: false, message: expect.stringContaining("protégé par un mot de passe") });
  });
});

describe("Avant de valider", () => {
  it("les 3 vérifications de la maquette", () => {
    expect(verificationsAvantArchivage("Extrait d'acte de naissance", "MUGISHO Bahati Jean").map((v) => v.avant + v.gras)).toEqual([
      "Il s'agit bien de : extrait d'acte de naissance",
      "Il est au nom de MUGISHO Bahati Jean",
      "Il est signé et cacheté, et lisible",
    ]);
  });

  it("motif pour refaire le scan", () => {
    expect(lireMotifRemplacement("  Page 2   illisible ")).toEqual({ ok: true, motif: "Page 2 illisible" });
    expect(lireMotifRemplacement("flou")).toMatchObject({ ok: false });
    expect(lireMotifRemplacement("x".repeat(301))).toMatchObject({ ok: false, message: expect.stringContaining("300") });
  });
});

it("mode d'import enregistré : scanner, sinon photo, sinon fichier", () => {
  const pdf: PageSource = { genre: "pdf", source: 0, page: 0, rotation: 0 };
  const photo: PageSource = { genre: "image", source: 1, largeur: 10, hauteur: 10, rotation: 0, photo: true };
  expect([modeImport([pdf]), modeImport([pdf, photo]), modeImport([photo, { ...pdf, scanner: true }])]).toEqual(["fichier", "photo", "scanner"]);
});
