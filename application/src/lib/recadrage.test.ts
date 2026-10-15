// @vitest-environment node
// Fichier 34 — recadrage d'une photo : géométrie, redressement, lisibilité, repérage des coins avec la VRAIE OpenCV
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import jpeg from "jpeg-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  aire, ameliorerLisibilite, coinsParDefaut, coinsPlausibles, deplacerCoin, detecterCoins, estConvexe, evaluerQualite, homographie,
  messageQualite, ordonnerCoins, redresser, tailleRedressee, type Coins, type ImageRgba, type OpenCV,
} from "./recadrage";

const C = (...p: [number, number][]) => p.map(([x, y]) => ({ x, y })) as Coins;
const fichier = (nom: string) => readFileSync(new URL(`../test/fichiers/${nom}`, import.meta.url));
const photo = (nom: string): ImageRgba => {
  const { data, width, height } = jpeg.decode(fichier(nom), { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8ClampedArray(data), width, height };
};

describe("Géométrie des coins", () => {
  it("ordre : haut-gauche, haut-droite, bas-droite, bas-gauche (quel que soit l'ordre donné)", () => {
    const attendu = C([470, 95], [1210, 170], [1150, 1130], [380, 1060]);
    expect(ordonnerCoins([attendu[2], attendu[0], attendu[3], attendu[1]])).toEqual(attendu);
  });

  it("cadre par défaut, aire, convexité, feuille plausible", () => {
    expect(coinsParDefaut(1000, 800)).toEqual(C([60, 48], [940, 48], [940, 752], [60, 752]));
    expect(aire(C([0, 0], [10, 0], [10, 5], [0, 5]))).toBe(50);
    expect(estConvexe(C([0, 0], [10, 0], [2, 2], [0, 10]))).toBe(false);
    expect(coinsPlausibles(coinsParDefaut(1000, 800), 1000, 800)).toBe(true);
    expect(coinsPlausibles(C([0, 0], [100, 0], [100, 100], [0, 100]), 1000, 800)).toBe(false); // trop petit
  });

  it("un coin déplacé au doigt reste dans la photo", () => {
    const c = coinsParDefaut(1000, 800);
    expect(deplacerCoin(c, 2, { x: 1200, y: -5 }, 1000, 800)[2]).toEqual({ x: 1000, y: 0 });
    expect(deplacerCoin(c, 2, { x: 1200, y: -5 }, 1000, 800)[0]).toBe(c[0]);
  });

  it("taille de la page redressée : proportions A4 reconnues, 2 339 pixels au plus", () => {
    expect(tailleRedressee(C([0, 0], [1000, 0], [1000, 1380], [0, 1380]))).toEqual({ largeur: 976, hauteur: 1380 }); // presque A4 → exactement A4
    expect(tailleRedressee(C([0, 0], [3000, 0], [3000, 2150], [0, 2150]))).toEqual({ largeur: 2339, hauteur: 1654 }); // A4 couché, réduit
    expect(tailleRedressee(C([0, 0], [800, 0], [800, 800], [0, 800]))).toEqual({ largeur: 800, hauteur: 800 }); // carré : gardé
  });
});

describe("Redressement (sans OpenCV)", () => {
  it("l'homographie envoie chaque coin sur le coin voulu", () => {
    const de = C([40, 30], [220, 50], [200, 230], [30, 210]);
    const vers = C([0, 0], [100, 0], [100, 141], [0, 141]);
    const [a, b, c, d, e, f, g, h] = homographie(de, vers);
    for (let i = 0; i < 4; i++) {
      const { x, y } = de[i];
      const w = g * x + h * y + 1;
      expect((a * x + b * y + c) / w).toBeCloseTo(vers[i].x, 6);
      expect((d * x + e * y + f) / w).toBeCloseTo(vers[i].y, 6);
    }
  });

  it("chaque point de la page redressée vient du bon endroit de la photo", () => {
    // Photo d'essai : rouge = colonne, vert = ligne
    const W = 256;
    const data = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) data.set([x, y, 0, 255], (y * W + x) * 4);
    const page = redresser({ data, width: W, height: W }, C([40, 30], [220, 50], [200, 230], [30, 210]), 100, 141);
    const pixel = (x: number, y: number) => Array.from(page.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 2));
    expect([page.width, page.height]).toEqual([100, 141]);
    pixel(0, 0).forEach((v, k) => expect(Math.abs(v - [40, 30][k])).toBeLessThanOrEqual(3));
    pixel(99, 140).forEach((v, k) => expect(Math.abs(v - [200, 230][k])).toBeLessThanOrEqual(3));
    pixel(99, 0).forEach((v, k) => expect(Math.abs(v - [220, 50][k])).toBeLessThanOrEqual(3));
  });
});

describe("Améliorer la lisibilité", () => {
  const image = (...px: [number, number, number][]) => ({ data: new Uint8ClampedArray(px.flatMap((p) => [...p, 255])), width: px.length, height: 1 });

  it("papier gris → blanc, encre → noire, cachet bleu reste bleu", () => {
    const papier: [number, number, number][] = Array.from({ length: 80 }, () => [140, 138, 132]);
    const encre: [number, number, number][] = Array.from({ length: 15 }, () => [30, 30, 30]);
    const cachet: [number, number, number][] = Array.from({ length: 5 }, () => [40, 60, 130]);
    const r = ameliorerLisibilite(image(...papier, ...encre, ...cachet));
    const px = (i: number) => Array.from(r.data.slice(i * 4, i * 4 + 3));
    expect(Math.min(...px(0))).toBeGreaterThanOrEqual(235);
    expect(Math.max(...px(80))).toBeLessThanOrEqual(5);
    const [rr, , bb] = px(99);
    expect(bb - rr).toBeGreaterThan(100);
  });

  it("image déjà bien contrastée : inchangée", () => {
    const px: [number, number, number][] = [...Array.from({ length: 70 }, (): [number, number, number] => [250, 250, 250]), ...Array.from({ length: 30 }, (): [number, number, number] => [20, 20, 20])];
    const avant = image(...px);
    expect(Array.from(ameliorerLisibilite(avant).data)).toEqual(Array.from(avant.data));
  });
});

describe("Repérage des coins avec OpenCV (photos d'essai)", () => {
  let cv: OpenCV;
  beforeAll(async () => {
    const paquet = createRequire(import.meta.url)("@techstark/opencv-js");
    // Le module d'OpenCV.js se présente comme une promesse qui se renvoie elle-même : on retire « then »
    cv = paquet.Mat ? paquet : await new Promise((r) => paquet.then((m: OpenCV) => { delete m.then; r(m); }));
  });
  const verite = JSON.parse(fichier("photos-coins.json").toString()) as Record<string, [number, number][]>;

  it.each(["photo-de-travers.jpg", "photo-sombre.jpg"])("%s : les 4 coins trouvés à moins de 1,5 % près", (nom) => {
    const image = photo(nom);
    const coins = detecterCoins(cv, image);
    expect(coins).not.toBeNull();
    const diagonale = Math.hypot(image.width, image.height);
    coins!.forEach((p, i) => expect(Math.hypot(p.x - verite[nom][i][0], p.y - verite[nom][i][1]) / diagonale).toBeLessThan(0.015));
  });

  it("aucune feuille sur la photo : rien d'inventé (l'officier place les coins)", () => {
    expect(detecterCoins(cv, photo("photo-sans-feuille.jpg"))).toBeNull();
  });
});

describe("Qualité de la page redressée (avertissement)", () => {
  const verite = JSON.parse(fichier("photos-coins.json").toString()) as Record<string, [number, number][]>;
  const page = (nom: string, coinsDe = nom) => {
    const c = verite[coinsDe].map(([x, y]) => ({ x, y })) as Coins;
    const { largeur, hauteur } = tailleRedressee(c);
    return redresser(photo(nom), c, largeur, hauteur);
  };

  it("photo nette et bien éclairée : aucun message", () => {
    const q = evaluerQualite(page("photo-de-travers.jpg"));
    expect([q.floue, q.sombre, messageQualite(q)]).toEqual([false, false, null]);
  });

  it("photo floue (même feuille, flou de 4 pixels) : « Photo floue »", () => {
    const q = evaluerQualite(page("photo-floue.jpg", "photo-de-travers.jpg"));
    expect([q.floue, q.sombre]).toEqual([true, false]);
    expect(messageQualite(q)).toMatch(/^Photo floue : reprenez-la/);
  });

  it("photo sombre mais nette : « trop sombre », pas « floue » ; corrigée par « Améliorer la lisibilité »", () => {
    const p = page("photo-sombre.jpg");
    const q = evaluerQualite(p);
    expect([q.floue, q.sombre]).toEqual([false, true]);
    expect(messageQualite(q)).toMatch(/^Photo trop sombre/);
    expect(messageQualite(evaluerQualite(ameliorerLisibilite(p)))).toBeNull();
  });

  it("floue et sombre à la fois : un seul message qui dit les deux", () => {
    expect(messageQualite({ nettete: 10, luminosite: 90, floue: true, sombre: true })).toMatch(/^Photo floue et trop sombre/);
  });
});
