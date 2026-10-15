/**
 * Outils du NAVIGATEUR pour la photo d'un acte (fichier 34) : chargement
 * d'OpenCV.js à la demande, lecture de la photo, conversion en JPEG.
 */
import { COMPRESSION } from "./archivage";
import type { ImageRgba, OpenCV } from "./recadrage";

/** Même version que dans scripts/copier-opencv.mjs (le nom du fichier porte la version : cache d'un an). */
export const ADRESSE_OPENCV = "/vendor/opencv-4.12.0-release.1.js";
/** Au-delà, on renonce au repérage automatique : l'officier place les coins à la main. */
export const DELAI_OPENCV_MS = 90_000;

let chargement: Promise<OpenCV> | null = null;

/** Charge OpenCV.js une seule fois (3,5 Mo, gardé ensuite par le navigateur). */
export function chargerOpenCV(adresse = ADRESSE_OPENCV, delaiMs = DELAI_OPENCV_MS): Promise<OpenCV> {
  chargement ??= new Promise<OpenCV>((resoudre, rejeter) => {
    const fenetre = window as unknown as { cv?: OpenCV };
    const pret = (cv: OpenCV) => {
      // Le module d'OpenCV.js se présente comme une promesse qui se renvoie elle-même : on retire « then »
      if (cv.Mat) return resoudre(cv);
      if (typeof cv.then === "function") {
        cv.then((m: OpenCV) => {
          delete m.then;
          resoudre(m);
        });
      } else cv.onRuntimeInitialized = () => resoudre(cv);
    };
    if (fenetre.cv) return pret(fenetre.cv);
    const minuterie = setTimeout(() => rejeter(new Error("trop lent")), delaiMs);
    const script = document.createElement("script");
    script.src = adresse;
    script.async = true;
    script.onload = () => {
      clearTimeout(minuterie);
      if (fenetre.cv) pret(fenetre.cv);
      else rejeter(new Error("illisible"));
    };
    script.onerror = () => {
      clearTimeout(minuterie);
      rejeter(new Error("introuvable"));
    };
    document.head.appendChild(script);
  }).catch((e) => {
    // Un nouvel essai reste possible à la photo suivante
    chargement = null;
    throw e;
  });
  return chargement;
}

/** Photo → image RGBA, orientée comme sur le téléphone, réduite à 3 000 pixels au plus. */
export async function lirePhoto(fichier: Blob, coteMaximum = 3000): Promise<ImageRgba> {
  const image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  const echelle = Math.min(1, coteMaximum / Math.max(image.width, image.height));
  const [l, h] = [Math.round(image.width * echelle), Math.round(image.height * echelle)];
  const toile = document.createElement("canvas");
  toile.width = l;
  toile.height = h;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne peut pas lire la photo.");
  ctx.drawImage(image, 0, 0, l, h);
  image.close();
  const { data } = ctx.getImageData(0, 0, l, h);
  return { data, width: l, height: h };
}

/** Image RGBA → JPEG couleur compressé (même réglage que les photos importées). */
export async function imageVersJpeg(image: ImageRgba): Promise<{ jpeg: Uint8Array; largeur: number; hauteur: number }> {
  const toile = document.createElement("canvas");
  toile.width = image.width;
  toile.height = image.height;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne peut pas préparer la photo.");
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  const blob = await new Promise<Blob | null>((r) => toile.toBlob(r, "image/jpeg", COMPRESSION.qualite));
  if (!blob) throw new Error("Ce navigateur ne peut pas compresser la photo.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), largeur: image.width, hauteur: image.height };
}

/** Image RGBA → adresse affichable (aperçu de la photo à recadrer). */
export function imageVersAdresse(image: ImageRgba, coteAffiche = 1200): string {
  const echelle = Math.min(1, coteAffiche / Math.max(image.width, image.height));
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  source.getContext("2d")!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext("2d")!.drawImage(source, 0, 0, toile.width, toile.height);
  return toile.toDataURL("image/jpeg", 0.8);
}
