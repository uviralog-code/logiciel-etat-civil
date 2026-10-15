/**
 * PHOTOS PAR TÉLÉPHONE (fichier 34) : le transfert téléphone → ordinateur.
 *
 * 1. L'ordinateur de l'Officier crée un lien secret (QR code) valable
 *    10 minutes pour UN acte (migration 22).
 * 2. Le téléphone ouvre ce lien SANS mot de passe, photographie l'acte,
 *    recadre chaque page et la dépose.
 * 3. L'ordinateur reprend les pages (elles sont alors effacées de la base),
 *    puis l'Officier vérifie et valide l'archivage comme d'habitude.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PagePhoto {
  jpeg: Uint8Array;
  largeur: number;
  hauteur: number;
}

export interface Transfert {
  id: string;
  secret: string;
  expireLe: string;
}

export interface ActeDuTransfert {
  identifiant: string;
  typeLibelle: string;
  couleur: string | null;
  titulaire: string;
  pages: number;
  expireLe: string;
  termine: boolean;
}

/** Adresse ouverte par le téléphone (le secret ne quitte jamais l'adresse). */
export const adresseTelephone = (origine: string, secret: string) => `${origine}/photo/${secret}`;

/** Un secret de lien a la forme produite par la base (43 caractères sûrs dans une adresse). */
export const secretValide = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);

// ---------------------------------------------------------------------
// Base64 (navigateur, même ancien, et serveur)
// ---------------------------------------------------------------------
export function versBase64(octets: Uint8Array): string {
  let texte = "";
  for (let i = 0; i < octets.length; i += 0x8000) texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(texte);
}

export function depuisBase64(b64: string): Uint8Array {
  const texte = atob(b64.replace(/\s/g, ""));
  const octets = new Uint8Array(texte.length);
  for (let i = 0; i < texte.length; i++) octets[i] = texte.charCodeAt(i);
  return octets;
}

const message = (e: { code?: string; message: string }, defaut: string) => (e.code === "P0001" ? e.message : `${defaut} : ${e.message}`);

// ---------------------------------------------------------------------
// Ordinateur (Officier connecté)
// ---------------------------------------------------------------------
export async function creerTransfert(supabase: SupabaseClient, acteId: string): Promise<{ ok: true; transfert: Transfert } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("creer_transfert_photo", { p_acte: acteId }).single<{ id: string; secret: string; expire_le: string }>();
  if (error) return { ok: false, message: message(error, "Le QR code n'a pas pu être créé") };
  return { ok: true, transfert: { id: data.id, secret: data.secret, expireLe: data.expire_le } };
}

export interface Reception {
  pages: (PagePhoto & { numero: number })[];
  termine: boolean;
  expire: boolean;
}

/** Pages arrivées depuis la dernière fois (elles sont effacées de la base une fois reprises). */
export async function recupererPages(supabase: SupabaseClient, transfertId: string): Promise<Reception> {
  const { data, error } = await supabase.rpc("recuperer_pages_photo", { p_transfert: transfertId });
  if (error) throw new Error(message(error, "Réception des photos impossible"));
  const r = data as { pages: { numero: number; jpeg: string; largeur: number; hauteur: number }[]; termine: boolean; expire: boolean };
  return {
    pages: r.pages.map((p) => ({ numero: p.numero, jpeg: depuisBase64(p.jpeg), largeur: p.largeur, hauteur: p.hauteur })),
    termine: r.termine,
    expire: r.expire,
  };
}

// ---------------------------------------------------------------------
// Téléphone (sans mot de passe, avec le secret)
// ---------------------------------------------------------------------
export async function lireTransfert(supabase: SupabaseClient, secret: string): Promise<{ ok: true; acte: ActeDuTransfert } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("lire_transfert_photo", { p_secret: secret }).maybeSingle<{
    identifiant: string; type_libelle: string; couleur: string | null; titulaire: string; pages: number; expire_le: string; termine: boolean;
  }>();
  if (error || !data) return { ok: false, message: error ? message(error, "Lien illisible") : "Ce lien n'est plus valable." };
  return {
    ok: true,
    acte: { identifiant: data.identifiant, typeLibelle: data.type_libelle, couleur: data.couleur, titulaire: data.titulaire, pages: data.pages, expireLe: data.expire_le, termine: data.termine },
  };
}

export async function envoyerPage(supabase: SupabaseClient, secret: string, page: PagePhoto): Promise<{ ok: true; numero: number } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("ajouter_page_photo", {
    p_secret: secret, p_jpeg: versBase64(page.jpeg), p_largeur: page.largeur, p_hauteur: page.hauteur,
  });
  if (error) return { ok: false, message: message(error, "La page n'a pas pu être envoyée") };
  return { ok: true, numero: data as number };
}

export async function terminerEnvoi(supabase: SupabaseClient, secret: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc("terminer_transfert_photo", { p_secret: secret });
  return error ? { ok: false, message: message(error, "Fin de l'envoi impossible") } : { ok: true };
}

/** « encore 9 min » — temps restant avant l'expiration du lien. */
export function tempsRestant(expireLe: string, maintenant = Date.now()): { minutes: number; texte: string; expire: boolean } {
  const ms = new Date(expireLe).getTime() - maintenant;
  if (ms <= 0) return { minutes: 0, texte: "expiré", expire: true };
  const minutes = Math.ceil(ms / 60000);
  return { minutes, texte: minutes <= 1 ? "moins d'une minute" : `encore ${minutes} min`, expire: false };
}
