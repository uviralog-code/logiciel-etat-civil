/**
 * MONTANT EN TOUTES LETTRES (fichier 39) — pour le reçu
 *
 * Orthographe traditionnelle française :
 * - « vingt et un », « soixante et onze », mais « quatre-vingt-un » ;
 * - « quatre-vingts » et « deux cents » prennent un s quand ils terminent le
 *   nombre, ou devant « million(s) » / « milliard(s) » (des noms), mais pas
 *   devant « mille » : « deux cent mille », « quatre-vingt mille » ;
 * - « mille » ne prend jamais de s, et l'on dit « mille » (pas « un mille ») ;
 * - « un million de francs congolais » (de, quand le nombre finit par million).
 */
import type { Devise } from "./charte";

const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. `pluriel` : « quatre-vingts » peut prendre son s. */
function moinsDeCent(n: number, pluriel: boolean): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d <= 6) {
    if (u === 0) return DIZAINES[d];
    return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (d === 7) return u === 1 ? "soixante et onze" : `soixante-${UNITES[10 + u]}`;
  if (d === 8) return u === 0 ? (pluriel ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITES[u]}`;
  return `quatre-vingt-${UNITES[10 + u]}`; // 90 à 99
}

/** 0 à 999 (0 donne une chaîne vide). */
function moinsDeMille(n: number, pluriel: boolean): string {
  const c = Math.floor(n / 100);
  const reste = n % 100;
  const parties: string[] = [];
  if (c === 1) parties.push("cent");
  else if (c > 1) parties.push(reste === 0 && pluriel ? `${UNITES[c]} cents` : `${UNITES[c]} cent`);
  if (reste > 0) parties.push(moinsDeCent(reste, pluriel));
  return parties.join(" ");
}

/** Un entier positif ou nul en lettres : 85 500 → « quatre-vingt-cinq mille cinq cents ». */
export function nombreEnLettres(nombre: number): string {
  const n = Math.floor(Math.abs(nombre));
  if (!Number.isSafeInteger(n)) throw new Error("Nombre trop grand.");
  if (n === 0) return "zéro";
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;
  const parties: string[] = [];
  // Devant million(s) et milliard(s), noms : le pluriel de cent / quatre-vingt est gardé
  if (milliards) parties.push(`${nombreEnLettres(milliards)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parties.push(`${moinsDeMille(millions, true)} million${millions > 1 ? "s" : ""}`);
  // Devant « mille », adjectif : pas de pluriel ; « mille » seul pour 1 000
  if (milliers) parties.push(milliers === 1 ? "mille" : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parties.push(moinsDeMille(reste, true));
  return parties.join(" ");
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Montant du reçu en lettres :
 * « Quatre-vingt-cinq mille cinq cents francs congolais. »,
 * « Trente dollars américains. », « Douze dollars américains et cinquante cents. »
 */
export function montantEnLettres(montant: number, devise: Devise): string {
  const centimes = Math.round(Math.abs(Number(montant)) * 100);
  const entier = Math.floor(centimes / 100);
  const fraction = centimes % 100;
  const lettres = nombreEnLettres(entier);
  // « un million de francs », « deux milliards de dollars »
  const de = entier > 0 && entier % 1e6 === 0 ? "de " : "";
  const unite =
    devise === "CDF"
      ? entier > 1 ? "francs congolais" : "franc congolais"
      : entier > 1 ? "dollars américains" : "dollar américain";
  const base = `${lettres} ${de}${unite}`;
  if (fraction === 0) return `${majuscule(base)}.`;
  const sous = devise === "CDF" ? (fraction > 1 ? "centimes" : "centime") : fraction > 1 ? "cents" : "cent";
  return `${majuscule(base)} et ${nombreEnLettres(fraction)} ${sous}.`;
}
