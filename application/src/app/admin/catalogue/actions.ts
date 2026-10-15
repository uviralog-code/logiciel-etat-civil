"use server";

import { refresh } from "next/cache";
import { regleAcces } from "@/lib/aiguillage";
import {
  ajouterTypeActe,
  changerPresence,
  corrigerTypeActe,
  MESSAGES_CATALOGUE,
  type ResultatCatalogue,
  type SaisieCorrection,
  type SaisieTypeActe,
} from "@/lib/catalogue";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira } from "@/lib/tarifs";

/* Le droit d'agir est revérifié avant tout ; la base le revérifie encore (fichiers 08, 15 et 18). */
async function client() {
  return regleAcces(await lireAgentConnecte(), "admin").autorise ? creerClientServeur() : null;
}
const REFUS = { ok: false as const, message: MESSAGES_CATALOGUE.refus };
const texte = (v: unknown) => String(v ?? "");

/** « Ajouter au catalogue » (après confirmation). */
export async function ajouter(s: SaisieTypeActe): Promise<ResultatCatalogue> {
  const supabase = await client();
  if (!supabase) return REFUS;
  const saisie = s ?? ({} as SaisieTypeActe);
  const r = await ajouterTypeActe(
    supabase,
    {
      numero: texte(saisie.numero), code: texte(saisie.code), libelle: texte(saisie.libelle), famille: texte(saisie.famille),
      modele: texte(saisie.modele), couleur: texte(saisie.couleur), distinctEtranger: saisie.distinctEtranger === true,
      montantNational: texte(saisie.montantNational), deviseNational: texte(saisie.deviseNational),
      montantEtranger: texte(saisie.montantEtranger), deviseEtranger: texte(saisie.deviseEtranger),
      date: texte(saisie.date), motif: texte(saisie.motif),
    },
    aujourdhuiUvira(),
  );
  if (r.ok) refresh();
  return r;
}

/** « Modifier… » : libellé, famille, couleur. */
export async function corriger(id: string, s: SaisieCorrection): Promise<ResultatCatalogue> {
  const supabase = await client();
  if (!supabase) return REFUS;
  const r = await corrigerTypeActe(supabase, texte(id), { libelle: texte(s?.libelle), famille: texte(s?.famille), couleur: texte(s?.couleur) });
  if (r.ok) refresh();
  return r;
}

/** « Retirer… » ou « Remettre ». */
export async function changerPresenceAuCatalogue(id: string, actif: boolean): Promise<ResultatCatalogue> {
  const supabase = await client();
  if (!supabase) return REFUS;
  const r = await changerPresence(supabase, texte(id), actif === true);
  if (r.ok) refresh();
  return r;
}
