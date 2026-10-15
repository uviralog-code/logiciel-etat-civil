/**
 * Outils du NAVIGATEUR pour le scan d'un acte (fichier 33) :
 * - compression des photos (JPEG/PNG → JPEG couleur, 2 339 pixels au plus) ;
 * - lecture et dessin des pages d'un PDF avec pdf.js (aperçu).
 *
 * Ce module n'est utilisé que dans le navigateur (écran « Scan de l'acte »).
 */
import { COMPRESSION } from "./archivage";

/** Photo → JPEG couleur compressé, orientée comme sur le téléphone, fond blanc pour la transparence. */
export async function compresserImage(octets: Uint8Array, type: "image/jpeg" | "image/png") {
  const image = await createImageBitmap(new Blob([octets as Uint8Array<ArrayBuffer>], { type }), { imageOrientation: "from-image" });
  const echelle = Math.min(1, COMPRESSION.coteMaximum / Math.max(image.width, image.height));
  const largeur = Math.max(1, Math.round(image.width * echelle));
  const hauteur = Math.max(1, Math.round(image.height * echelle));
  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne peut pas préparer la photo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.drawImage(image, 0, 0, largeur, hauteur);
  image.close();
  const blob = await new Promise<Blob | null>((r) => toile.toBlob(r, "image/jpeg", COMPRESSION.qualite));
  if (!blob) throw new Error("Ce navigateur ne peut pas compresser la photo.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), largeur, hauteur };
}

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: Promise<Pdfjs> | null = null;

/**
 * pdf.js n'est chargé qu'à la première utilisation (il est lourd). On prend
 * sa version « legacy », qui fonctionne aussi sur les navigateurs moins
 * récents (téléphones et ordinateurs des communes).
 */
function chargerPdfjs(): Promise<Pdfjs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjs;
}

/** Nombre de pages d'un PDF ; refus clair s'il est protégé ou abîmé. */
export async function compterPages(octets: Uint8Array): Promise<number> {
  const { getDocument } = await chargerPdfjs();
  const tache = getDocument({ data: octets.slice() });
  try {
    return (await tache.promise).numPages;
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") {
      throw new Error("Ce PDF est protégé par un mot de passe : il ne peut pas être archivé.");
    }
    throw new Error("Ce PDF est abîmé ou illisible.");
  } finally {
    await tache.destroy();
  }
}

/**
 * Dessine une page (1 = la première) d'un PDF à la largeur voulue, dans une
 * toile NEUVE (jamais celle de l'écran : deux dessins ne se gênent donc pas).
 */
export async function dessinerPage(octets: Uint8Array, numero: number, largeur: number): Promise<HTMLCanvasElement> {
  const { getDocument } = await chargerPdfjs();
  const tache = getDocument({ data: octets.slice() });
  try {
    const doc = await tache.promise;
    const page = await doc.getPage(numero);
    const base = page.getViewport({ scale: 1 });
    const densite = Math.min(2, window.devicePixelRatio || 1);
    const vue = page.getViewport({ scale: (largeur / base.width) * densite });
    const toile = document.createElement("canvas");
    toile.width = Math.round(vue.width);
    toile.height = Math.round(vue.height);
    await page.render({ canvas: toile, viewport: vue }).promise;
    return toile;
  } finally {
    await tache.destroy();
  }
}
