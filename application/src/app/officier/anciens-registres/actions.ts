"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { regleAcces } from "@/lib/aiguillage";
import {
  ajouterActeAncien, creerLot, fermerLot, type ResultatAncien, type ResultatLot, type SaisieAncien, type SaisieLot,
} from "@/lib/anciens-registres";
import { enregistrerScan, type ResultatScan } from "@/lib/scans";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira } from "@/lib/tarifs";

/* Anciens registres (fichier 36) : le droit d'agir est revérifié à chaque fois. */
const REFUS = "Seul l'Officier de l'entité peut numériser les anciens registres. Reconnectez-vous.";
async function client() {
  return regleAcces(await lireAgentConnecte(), "officier").autorise ? creerClientServeur() : null;
}
const texte = (v: unknown) => String(v ?? "");

/** « Ouvrir le lot » : puis la page du lot. */
export async function ouvrirLot(s: SaisieLot): Promise<ResultatLot> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: REFUS };
  const r = await creerLot(supabase, { typeActeId: texte(s?.typeActeId), annee: texte(s?.annee), description: texte(s?.description) },
    Number(aujourdhuiUvira().slice(0, 4)));
  if (r.ok) redirect(`/officier/anciens-registres/${r.id}`);
  return r;
}

/** Ajoute l'ancien acte (sans son scan : il est joint juste après). */
export async function ajouterAncien(lotId: string, s: SaisieAncien): Promise<ResultatAncien> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: REFUS };
  return ajouterActeAncien(supabase, texte(lotId), {
    titulaire: texte(s?.titulaire), titulaire2: texte(s?.titulaire2), date: texte(s?.date), numero: texte(s?.numero),
  });
}

/** Après l'envoi du PDF : le serveur le relit et l'enregistre comme scan de l'acte, dans le lot. */
export async function archiverAncien(acteId: string, lotId: string): Promise<ResultatScan> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: REFUS };
  return enregistrerScan(supabase, { acteId: texte(acteId), motif: null, mode: "lot", lotId: texte(lotId) });
}

/** « Fermer le lot » : définitif. */
export async function fermerLeLot(lotId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: REFUS };
  const r = await fermerLot(supabase, texte(lotId));
  if (r.ok) refresh();
  return r;
}
