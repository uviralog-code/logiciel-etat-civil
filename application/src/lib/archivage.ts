/**
 * ARCHIVER UN ACTE PAR FICHIER (fichier 33) — la partie commune au
 * navigateur et au serveur : contrôles, assemblage en UN seul PDF,
 * empreinte SHA-256.
 *
 * Décision : l'archive d'un acte est toujours un seul PDF. L'officier peut
 * choisir des PDF, des photos JPEG ou PNG (ou un mélange, page par page) :
 * tout est réuni ici en un PDF, avec pdf-lib.
 *
 * Le PDF produit est « reproductible » : les mêmes pages donnent exactement
 * le même fichier (aucune date ni identifiant aléatoire dedans). Ainsi, le
 * même document déposé deux fois a la même empreinte et la base le repère.
 */
import { degrees, PDFDocument } from "pdf-lib";

/** 15 Mo, comme l'espace de stockage « archives ». */
export const TAILLE_MAXIMUM = 15 * 1024 * 1024;
/** Limite de la base (documents_scannes.nb_pages). */
export const PAGES_MAXIMUM = 500;
/** Photos : côté le plus long ramené à 2 339 pixels (une page A4 à 200 points par pouce), en couleur. */
export const COMPRESSION = { coteMaximum: 2339, qualite: 0.75, pointsParPouce: 200 } as const;

export type GenreFichier = "pdf" | "jpeg" | "png";

/** Le vrai format se lit dans les premiers octets du fichier, pas dans son nom. */
export function genreDuFichier(debut: Uint8Array): GenreFichier | null {
  const commence = (...octets: number[]) => octets.every((o, i) => debut[i] === o);
  if (commence(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (commence(0xff, 0xd8, 0xff)) return "jpeg";
  if (commence(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  return null;
}

/** « 210 Ko », « 1,4 Mo ». */
export function formaterTaille(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export type ControleFichier = { ok: true; genre: GenreFichier } | { ok: false; message: string };

/** Contrôle d'un fichier choisi par l'officier (avant toute transformation). */
export function controlerFichier(f: { nom: string; taille: number; debut: Uint8Array }): ControleFichier {
  if (f.taille === 0) return { ok: false, message: `« ${f.nom} » est vide.` };
  if (f.taille > TAILLE_MAXIMUM) {
    return { ok: false, message: `« ${f.nom} » est trop lourd (${formaterTaille(f.taille)}) : 15 Mo au plus.` };
  }
  const genre = genreDuFichier(f.debut);
  if (!genre) return { ok: false, message: `« ${f.nom} » n'est ni un PDF, ni une photo JPEG ou PNG.` };
  return { ok: true, genre };
}

// ---------------------------------------------------------------------
// Les pages du document à archiver
// ---------------------------------------------------------------------

/** Rotation demandée par l'officier (bouton « Pivoter »), en degrés. */
export type Rotation = 0 | 90 | 180 | 270;

export type PageSource =
  /** Une page d'un PDF choisi (source = son rang dans la liste des fichiers) */
  | { genre: "pdf"; source: number; page: number; rotation: Rotation; /** Venue du scanner du bureau (fichier 35) */ scanner?: boolean }
  /** Une photo, déjà compressée en JPEG dans le navigateur */
  | { genre: "image"; source: number; largeur: number; hauteur: number; rotation: Rotation; /** Photo recadrée (fichier 34) */ photo?: boolean; /** Venue du scanner du bureau (fichier 35) */ scanner?: boolean };

export const pivoter = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/**
 * Réunit les pages en UN seul PDF.
 * - `sources[i]` : octets du PDF ou de la photo JPEG numéro i.
 * - Un seul PDF, toutes ses pages, dans l'ordre, sans rotation : on le garde
 *   tel quel (aucune perte, même empreinte que le fichier d'origine).
 */
export async function assemblerPdf(pages: PageSource[], sources: Uint8Array[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("Aucune page à archiver.");
  if (pages.length > PAGES_MAXIMUM) throw new Error(`Trop de pages (${pages.length}) : ${PAGES_MAXIMUM} au plus.`);

  const pdfs = new Map<number, PDFDocument>();
  const lirePdf = async (source: number) => {
    if (!pdfs.has(source)) pdfs.set(source, await PDFDocument.load(sources[source], { updateMetadata: false }));
    return pdfs.get(source)!;
  };

  const premier = pages[0];
  if (premier.genre === "pdf" && pages.every((p) => p.genre === "pdf" && p.source === premier.source && p.rotation === 0)) {
    const doc = await lirePdf(premier.source);
    if (pages.length === doc.getPageCount() && pages.every((p, i) => p.genre === "pdf" && p.page === i)) {
      return sources[premier.source];
    }
  }

  // Aucune date ni identifiant : le même contenu donne le même fichier
  const sortie = await PDFDocument.create({ updateMetadata: false });
  for (const p of pages) {
    if (p.genre === "pdf") {
      const [copie] = await sortie.copyPages(await lirePdf(p.source), [p.page]);
      copie.setRotation(degrees((copie.getRotation().angle + p.rotation) % 360));
      sortie.addPage(copie);
    } else {
      const image = await sortie.embedJpg(sources[p.source]);
      const echelle = 72 / COMPRESSION.pointsParPouce;
      const [l, h] = [p.largeur * echelle, p.hauteur * echelle];
      const page = sortie.addPage([l, h]);
      page.drawImage(image, { x: 0, y: 0, width: l, height: h });
      page.setRotation(degrees(p.rotation));
    }
  }
  return sortie.save({ useObjectStreams: true });
}

/** Empreinte SHA-256 en hexadécimal (navigateur et serveur). */
export async function empreinteSha256(octets: Uint8Array): Promise<string> {
  const condense = await globalThis.crypto.subtle.digest("SHA-256", octets as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(condense), (o) => o.toString(16).padStart(2, "0")).join("");
}

/**
 * Relecture du PDF réellement déposé (côté serveur, avant d'enregistrer le
 * scan) : c'est bien un PDF lisible, sans mot de passe, de 1 à 500 pages.
 */
export async function relirePdf(octets: Uint8Array): Promise<{ ok: true; pages: number } | { ok: false; message: string }> {
  if (octets.length === 0) return { ok: false, message: "Le fichier déposé est vide." };
  if (octets.length > TAILLE_MAXIMUM) return { ok: false, message: "Le fichier déposé dépasse 15 Mo." };
  if (genreDuFichier(octets) !== "pdf") return { ok: false, message: "Le fichier déposé n'est pas un PDF." };
  try {
    const doc = await PDFDocument.load(octets, { updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages < 1) return { ok: false, message: "Le PDF déposé n'a aucune page." };
    if (pages > PAGES_MAXIMUM) return { ok: false, message: `Le PDF déposé a trop de pages (${pages}) : ${PAGES_MAXIMUM} au plus.` };
    return { ok: true, pages };
  } catch (e) {
    const chiffre = e instanceof Error && /encrypted/i.test(e.message);
    return {
      ok: false,
      message: chiffre
        ? "Ce PDF est protégé par un mot de passe : il ne peut pas être archivé. Scannez à nouveau le document sans protection."
        : "Ce PDF est abîmé ou illisible : il ne peut pas être archivé.",
    };
  }
}

// ---------------------------------------------------------------------
// Les vérifications à cocher avant de valider (maquette « Officier — Scan »)
// ---------------------------------------------------------------------
export function verificationsAvantArchivage(typeLibelle: string, titulaire: string): { id: string; avant: string; gras: string }[] {
  return [
    { id: "type", avant: "Il s'agit bien de : ", gras: typeLibelle.charAt(0).toLowerCase() + typeLibelle.slice(1) },
    { id: "nom", avant: "Il est au nom de ", gras: titulaire },
    { id: "signature", avant: "Il est ", gras: "signé et cacheté, et lisible" },
  ];
}

/** Motif obligatoire pour refaire le scan (version 2 et suivantes). */
export function lireMotifRemplacement(texte: string): { ok: true; motif: string } | { ok: false; message: string } {
  const motif = texte.trim().replace(/\s+/g, " ");
  if (motif.length < 5) return { ok: false, message: "Indiquez pourquoi le scan est refait (5 caractères au moins), ex. « Page 2 illisible »." };
  if (motif.length > 300) return { ok: false, message: "Le motif est trop long (300 caractères au plus)." };
  return { ok: true, motif };
}

/** Comment le document a été obtenu (colonne mode_import) : scanner, photo, sinon fichier. */
export function modeImport(pages: PageSource[]): "scanner" | "photo" | "fichier" {
  if (pages.some((p) => p.scanner)) return "scanner";
  if (pages.some((p) => p.genre === "image" && p.photo)) return "photo";
  return "fichier";
}
