import "server-only";
import { headers } from "next/headers";

/**
 * Adresse publique du logiciel, pour les liens imprimés (QR code du reçu, fichier 39).
 * Réglage ADRESSE_PUBLIQUE s'il est donné (ex. https://etatcivil.cdjp-bukavu.org),
 * sinon l'adresse par laquelle la page a été demandée.
 */
export async function adressePublique(): Promise<string> {
  const reglage = process.env.ADRESSE_PUBLIQUE?.trim();
  if (reglage && /^https?:\/\/[^\s/]+$/.test(reglage.replace(/\/+$/, ""))) return reglage.replace(/\/+$/, "");
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocole = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") || hote.startsWith("127.") ? "http" : "https");
  return `${protocole.split(",")[0].trim()}://${hote.split(",")[0].trim()}`;
}
