"use server";

import { refresh } from "next/cache";
import { regleAcces } from "@/lib/aiguillage";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { enregistrerTaux, MESSAGES_TAUX, type ResultatTaux } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";

/**
 * « Enregistrer le taux ». Le droit d'agir est revérifié ; l'entité est celle du
 * caissier connecté, jamais une valeur venue du navigateur (la base le revérifie).
 */
export async function enregistrer(texte: string): Promise<ResultatTaux> {
  const agent = await lireAgentConnecte();
  if (!regleAcces(agent, "caissier").autorise || !agent?.profil.entite) return { ok: false, message: MESSAGES_TAUX.refus };
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite.code);
  if (!entite) return { ok: false, message: MESSAGES_TAUX.refus };
  const resultat = await enregistrerTaux(supabase, entite.id, String(texte ?? ""));
  if (resultat.ok) refresh();
  return resultat;
}
