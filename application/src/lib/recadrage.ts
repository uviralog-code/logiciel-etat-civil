/**
 * RECADRAGE D'UNE PHOTO DE DOCUMENT (fichier 34)
 *
 * 1. Repérer les 4 coins de la feuille sur la photo (OpenCV) — méthode
 *    reprise de jscanify (MIT, © ColonelParrot) et renforcée : contours,
 *    approximation en quadrilatère, puis, à défaut, les points extrêmes du
 *    plus grand contour (méthode d'origine de jscanify) ; essai sur les
 *    bords (Canny) puis sur le contraste feuille/fond (Otsu).
 * 2. Redresser la feuille (correction de perspective) : écrit ici en
 *    JavaScript simple, SANS OpenCV. Si OpenCV ne se charge pas (connexion
 *    trop lente), l'officier place les coins à la main et le redressement
 *    fonctionne quand même.
 * 3. « Améliorer la lisibilité » : fond éclairci, couleurs gardées (cachets).
 */

export interface Point {
  x: number;
  y: number;
}
/** Haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Coins = [Point, Point, Point, Point];

export interface ImageRgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------

/** Remet 4 points dans l'ordre haut-gauche, haut-droite, bas-droite, bas-gauche. */
export function ordonnerCoins(points: Point[]): Coins {
  if (points.length !== 4) throw new Error("Il faut exactement 4 coins.");
  const parSomme = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const parDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  return [parSomme[0], parDiff[0], parSomme[3], parDiff[3]];
}

/** Coins proposés quand rien n'est repéré : un cadre légèrement en retrait des bords. */
export function coinsParDefaut(largeur: number, hauteur: number, marge = 0.06): Coins {
  const [mx, my] = [largeur * marge, hauteur * marge];
  return [
    { x: mx, y: my },
    { x: largeur - mx, y: my },
    { x: largeur - mx, y: hauteur - my },
    { x: mx, y: hauteur - my },
  ];
}

export function aire(c: Coins): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b] = [c[i], c[(i + 1) % 4]];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function estConvexe(c: Coins): boolean {
  let signe = 0;
  for (let i = 0; i < 4; i++) {
    const [a, b, d] = [c[i], c[(i + 1) % 4], c[(i + 2) % 4]];
    const z = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (z === 0) return false;
    if (signe === 0) signe = Math.sign(z);
    else if (Math.sign(z) !== signe) return false;
  }
  return true;
}

/** Une feuille plausible : convexe, au moins 15 % de la photo, aucun côté minuscule. */
export function coinsPlausibles(c: Coins, largeur: number, hauteur: number): boolean {
  if (!estConvexe(c)) return false;
  if (aire(c) < 0.15 * largeur * hauteur) return false;
  const minimum = 0.1 * Math.min(largeur, hauteur);
  return c.every((p, i) => distance(p, c[(i + 1) % 4]) >= minimum);
}

/** Déplacement d'un coin au doigt, sans sortir de la photo. */
export function deplacerCoin(c: Coins, i: number, p: Point, largeur: number, hauteur: number): Coins {
  const n = [...c] as Coins;
  n[i] = { x: Math.min(Math.max(p.x, 0), largeur), y: Math.min(Math.max(p.y, 0), hauteur) };
  return n;
}

/** Côté le plus long de la page redressée (une page A4 à 200 points par pouce). */
export const COTE_MAXIMUM = 2339;
const A4 = Math.SQRT2;

/**
 * Taille de la page redressée : proportions mesurées sur la photo, ramenées
 * exactement à celles d'une feuille A4 si elles en sont proches (8 %).
 */
export function tailleRedressee(c: Coins, coteMaximum = COTE_MAXIMUM): { largeur: number; hauteur: number } {
  const l = (distance(c[0], c[1]) + distance(c[3], c[2])) / 2;
  const h = (distance(c[0], c[3]) + distance(c[1], c[2])) / 2;
  let ratio = h / l;
  if (Math.abs(ratio - A4) / A4 < 0.08) ratio = A4;
  else if (Math.abs(ratio - 1 / A4) * A4 < 0.08) ratio = 1 / A4;
  const long = Math.min(coteMaximum, Math.max(l, h));
  return ratio >= 1
    ? { largeur: Math.round(long / ratio), hauteur: Math.round(long) }
    : { largeur: Math.round(long), hauteur: Math.round(long * ratio) };
}

// ---------------------------------------------------------------------
// Redressement (correction de perspective), en JavaScript simple
// ---------------------------------------------------------------------

/** Matrice 3×3 (8 valeurs + 1) qui envoie les 4 points `de` sur les 4 points `vers`. */
export function homographie(de: Coins, vers: Coins): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = de[i];
    const { x: X, y: Y } = vers[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  // Élimination de Gauss avec pivot
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    if (Math.abs(A[col][col]) < 1e-12) throw new Error("Coins alignés : impossible de redresser.");
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  return [...A.map((ligne, i) => ligne[8] / ligne[i]), 1];
}

/**
 * Redresse la feuille délimitée par `coins` en une image largeur × hauteur
 * (interpolation bilinéaire ; fond blanc hors de la photo).
 */
export function redresser(source: ImageRgba, coins: Coins, largeur: number, hauteur: number): ImageRgba {
  const cible: Coins = [{ x: 0, y: 0 }, { x: largeur, y: 0 }, { x: largeur, y: hauteur }, { x: 0, y: hauteur }];
  // Pour chaque point de la page redressée, son point sur la photo
  const [a, b, c, d, e, f, g, h] = homographie(cible, coins);
  const sortie = new Uint8ClampedArray(largeur * hauteur * 4);
  const { data, width: W, height: H } = source;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const w = g * px + h * py + 1;
      const sx = (a * px + b * py + c) / w - 0.5;
      const sy = (d * px + e * py + f) / w - 0.5;
      const o = (y * largeur + x) * 4;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) {
        sortie[o] = sortie[o + 1] = sortie[o + 2] = sortie[o + 3] = 255;
        continue;
      }
      const [fx, fy] = [sx - x0, sy - y0];
      const i00 = (y0 * W + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + W * 4;
      const i11 = i01 + 4;
      for (let k = 0; k < 3; k++) {
        const haut = data[i00 + k] * (1 - fx) + data[i10 + k] * fx;
        const bas = data[i01 + k] * (1 - fx) + data[i11 + k] * fx;
        sortie[o + k] = haut * (1 - fy) + bas * fy;
      }
      sortie[o + 3] = 255;
    }
  }
  return { data: sortie, width: largeur, height: hauteur };
}

// ---------------------------------------------------------------------
// Améliorer la lisibilité (couleurs gardées)
// ---------------------------------------------------------------------

/**
 * Éclaircit le fond et renforce le contraste : le gris du papier mal éclairé
 * devient blanc, l'encre reste foncée, le bleu d'un cachet reste bleu.
 * Sans effet sur une image déjà bien contrastée.
 */
export function ameliorerLisibilite(image: ImageRgba): ImageRgba {
  const { data } = image;
  const histogramme = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) histogramme[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  const centile = (p: number) => {
    let cumul = 0;
    for (let v = 0; v < 256; v++) if ((cumul += histogramme[v]) >= p * n) return v;
    return 255;
  };
  const noir = centile(0.02);
  const fond = centile(0.6);
  const sortie = new Uint8ClampedArray(data.length);
  if (fond - noir < 40 || fond >= 245) {
    sortie.set(data);
    return { ...image, data: sortie };
  }
  const echelle = 255 / (fond - noir);
  for (let i = 0; i < data.length; i += 4) {
    for (let k = 0; k < 3; k++) sortie[i + k] = (data[i + k] - noir) * echelle;
    sortie[i + 3] = data[i + 3];
  }
  return { ...image, data: sortie };
}

// ---------------------------------------------------------------------
// Qualité de la page : floue ? trop sombre ? (un simple avertissement)
// ---------------------------------------------------------------------

/** Seuils réglés sur les photos d'essai (src/test/fichiers) : voir recadrage.test.ts. */
export const SEUILS_QUALITE = { nettete: 80, luminosite: 160 } as const;

export interface Qualite {
  /**
   * Variance du laplacien sur l'image réduite à 800 pixels, contraste égalisé
   * (une photo sombre mais nette n'est pas jugée floue) : plus elle est haute,
   * plus les traits sont nets.
   */
  nettete: number;
  /** Luminosité moyenne (0 = noir, 255 = blanc). */
  luminosite: number;
  floue: boolean;
  sombre: boolean;
}

/** Évalue la page redressée, en JavaScript simple (rapide, même sur un téléphone modeste). */
export function evaluerQualite(image: ImageRgba): Qualite {
  const luminosite = luminositeMoyenne(griserReduire(image));
  const nettete = varianceLaplacien(griserReduire(ameliorerLisibilite(image)));
  return {
    nettete: Math.round(nettete * 10) / 10,
    luminosite: Math.round(luminosite),
    floue: nettete < SEUILS_QUALITE.nettete,
    sombre: luminosite < SEUILS_QUALITE.luminosite,
  };
}

type Gris = { gris: Float32Array; l: number; h: number };

/** Niveaux de gris, image réduite à 800 pixels en moyennant chaque case. */
function griserReduire(image: ImageRgba): Gris {
  const echelle = Math.min(1, 800 / Math.max(image.width, image.height));
  const [l, h] = [Math.max(3, Math.round(image.width * echelle)), Math.max(3, Math.round(image.height * echelle))];
  // Niveaux de gris, en moyennant les pixels de chaque case (réduction propre)
  const gris = new Float32Array(l * h);
  const nombre = new Uint32Array(l * h);
  const { data, width: W, height: H } = image;
  for (let y = 0; y < H; y++) {
    const yy = Math.min(h - 1, Math.floor(y * echelle));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const k = yy * l + Math.min(l - 1, Math.floor(x * echelle));
      gris[k] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      nombre[k]++;
    }
  }
  for (let k = 0; k < gris.length; k++) gris[k] /= Math.max(1, nombre[k]);
  return { gris, l, h };
}

function luminositeMoyenne({ gris }: Gris): number {
  let somme = 0;
  for (let k = 0; k < gris.length; k++) somme += gris[k];
  return somme / gris.length;
}

/** Laplacien (4 voisins) et sa variance, sans les bords. */
function varianceLaplacien({ gris, l, h }: Gris): number {
  let n = 0;
  let moyenne = 0;
  let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < l - 1; x++) {
      const k = y * l + x;
      const v = gris[k - 1] + gris[k + 1] + gris[k - l] + gris[k + l] - 4 * gris[k];
      n++;
      const d = v - moyenne;
      moyenne += d / n;
      m2 += d * (v - moyenne);
    }
  }
  return n > 1 ? m2 / (n - 1) : 0;
}

/** Le message à montrer à l'officier, ou null si la photo est bonne. */
export function messageQualite(q: Qualite): string | null {
  if (q.floue && q.sombre) return "Photo floue et trop sombre : reprenez-la en tenant le téléphone immobile, près d'une fenêtre ou d'une lampe.";
  if (q.floue) return "Photo floue : reprenez-la en tenant le téléphone bien immobile (appuyez sur l'écran pour faire la mise au point).";
  if (q.sombre) return "Photo trop sombre : reprenez-la près d'une fenêtre ou d'une lampe, ou cochez « Améliorer la lisibilité ».";
  return null;
}

// ---------------------------------------------------------------------
// Repérage des coins avec OpenCV
// ---------------------------------------------------------------------

/* Seules les fonctions d'OpenCV utilisées ici (OpenCV.js n'a pas de types). */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type OpenCV = any;

/** Taille de travail : la photo est réduite à 800 pixels pour aller vite (téléphones modestes). */
const TAILLE_ANALYSE = 800;

/**
 * Coins de la feuille sur une photo RGBA, ou null si aucune feuille plausible
 * n'est repérée (l'officier place alors les coins à la main).
 */
export function detecterCoins(cv: OpenCV, image: ImageRgba): Coins | null {
  const echelle = Math.min(1, TAILLE_ANALYSE / Math.max(image.width, image.height));
  const source = cv.matFromImageData(image);
  const petite = new cv.Mat();
  cv.resize(source, petite, new cv.Size(Math.round(image.width * echelle), Math.round(image.height * echelle)), 0, 0, cv.INTER_AREA);
  source.delete();
  const gris = new cv.Mat();
  cv.cvtColor(petite, gris, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gris, gris, new cv.Size(5, 5), 0);
  const [l, h] = [petite.cols, petite.rows];
  petite.delete();

  const noyau = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const bords = new cv.Mat();
  cv.Canny(gris, bords, 40, 140);
  cv.morphologyEx(bords, bords, cv.MORPH_CLOSE, noyau, new cv.Point(-1, -1), 2);
  const contraste = new cv.Mat();
  cv.threshold(gris, contraste, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.morphologyEx(contraste, contraste, cv.MORPH_OPEN, noyau, new cv.Point(-1, -1), 2);
  noyau.delete();
  gris.delete();

  let trouve: Coins | null = null;
  for (const binaire of [bords, contraste]) {
    trouve ??= chercherFeuille(cv, binaire, l, h);
    binaire.delete();
  }
  if (!trouve) return null;
  return trouve.map((p) => ({ x: p.x / echelle, y: p.y / echelle })) as Coins;
}

function chercherFeuille(cv: OpenCV, binaire: OpenCV, l: number, h: number): Coins | null {
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  cv.findContours(binaire, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  hierarchie.delete();
  const candidats: { i: number; aire: number }[] = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    candidats.push({ i, aire: cv.contourArea(c) });
    c.delete();
  }
  candidats.sort((a, b) => b.aire - a.aire);

  let resultat: Coins | null = null;
  for (const { i } of candidats.slice(0, 5)) {
    const c = contours.get(i);
    // 1. Le contour approché par un quadrilatère convexe
    const approche = new cv.Mat();
    cv.approxPolyDP(c, approche, 0.02 * cv.arcLength(c, true), true);
    if (approche.rows === 4) {
      const pts: Point[] = [];
      for (let k = 0; k < 4; k++) pts.push({ x: approche.data32S[2 * k], y: approche.data32S[2 * k + 1] });
      const coins = ordonnerCoins(pts);
      if (coinsPlausibles(coins, l, h)) resultat = coins;
    }
    approche.delete();
    // 2. Méthode d'origine de jscanify : le point le plus éloigné du centre dans chaque quart
    if (!resultat) {
      const coins = coinsExtremes(c, l, h);
      if (coins && coinsPlausibles(coins, l, h)) resultat = coins;
    }
    c.delete();
    if (resultat) break;
  }
  contours.delete();
  return resultat;
}

function coinsExtremes(contour: OpenCV, l: number, h: number): Coins | null {
  const [cx, cy] = [l / 2, h / 2];
  const meilleurs: (Point | null)[] = [null, null, null, null];
  const distances = [0, 0, 0, 0];
  for (let k = 0; k < contour.data32S.length; k += 2) {
    const p = { x: contour.data32S[k], y: contour.data32S[k + 1] };
    const quart = p.y < cy ? (p.x < cx ? 0 : 1) : p.x < cx ? 3 : 2;
    const d = distance(p, { x: cx, y: cy });
    if (d > distances[quart]) {
      distances[quart] = d;
      meilleurs[quart] = p;
    }
  }
  return meilleurs.every(Boolean) ? (meilleurs as Coins) : null;
}
