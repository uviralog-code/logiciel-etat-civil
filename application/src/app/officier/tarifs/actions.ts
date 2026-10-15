"use server";

import { refresh } from "next/cache";
import { regleAcces } from "@/lib/aiguillage";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import {
  annulerAjustement,
  lireEntite,
  MESSAGES_ENTITE,
  programmerAjustement,
  type ResultatAjustement,
  type SaisieAjustement,
} from "@/lib/tarifs-entite";

/*
 * Le droit d'agir est revérifié avant tout. L'entité n'est JAMAIS prise dans ce
 * que le navigateur envoie : c'est celle de l'officier connecté (et la base le
 * revérifie encore, fichier 08).
 */
async function entiteDeLOfficier() {
  const agent = await lireAgentConnecte();
  if (!regleAcces(agent, "officier").autorise || !agent?.profil.entite) return null;
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite.code);
  return entite ? { supabase, entite } : null;
}

/** « Programmer l'ajustement » ou « Revenir à la grille commune » (après confirmation). */
export async function programmer(saisie: SaisieAjustement): Promise<ResultatAjustement> {
  const contexte = await entiteDeLOfficier();
  if (!contexte) return { ok: false, message: MESSAGES_ENTITE.refus };
  const s = saisie ?? ({} as SaisieAjustement);
  const resultat = await programmerAjustement(contexte.supabase, contexte.entite, {
    mode: String(s.mode ?? "") as SaisieAjustement["mode"], // toute autre valeur est refusée au contrôle
    acteId: String(s.acteId ?? ""),
    categorie: String(s.categorie ?? ""),
    montant: String(s.montant ?? ""),
    devise: String(s.devise ?? ""),
    date: String(s.date ?? ""),
    motif: String(s.motif ?? ""),
  });
  if (resultat.ok) refresh();
  return resultat;
}

/** « Annuler… » sur un ajustement programmé (pas encore en vigueur). */
export async function annuler(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const contexte = await entiteDeLOfficier();
  if (!contexte) return { ok: false, message: MESSAGES_ENTITE.refus };
  const resultat = await annulerAjustement(contexte.supabase, String(id));
  if (resultat.ok) refresh();
  return resultat;
}
