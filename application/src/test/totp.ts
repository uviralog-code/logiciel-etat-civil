import { createHmac } from "node:crypto";

/**
 * Calcule le code à 6 chiffres qu'afficherait l'application du téléphone
 * (norme TOTP, RFC 6238 : HMAC-SHA1, période de 30 secondes).
 * Sert uniquement aux tests.
 */
export function codeTotp(secretBase32: string, instant = Date.now(), decalagePeriodes = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error(`Caractère invalide dans le secret : ${c}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const cle = Buffer.from(bits.match(/.{8}/g)!.map((o) => parseInt(o, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(instant / 1000 / 30) + decalagePeriodes));
  const h = createHmac("sha1", cle).update(compteur).digest();
  const decalage = h[h.length - 1] & 0x0f;
  const nombre = (h.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000;
  return String(nombre).padStart(6, "0");
}
