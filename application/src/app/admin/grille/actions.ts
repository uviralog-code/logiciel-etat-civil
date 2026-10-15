"use server";

import { refresh } from "next/cache";
import { regleAcces } from "@/lib/aiguillage";
import {
  annulerTarifCommun,
  MESSAGES_GRILLE,
  programmerTarifCommun,
  type ResultatAnnulation,
  type ResultatProgrammation,
  type SaisieTarif,
} from "@/lib/grille-commune";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";

/*
 * Une action serveur peut être appelée par n'importe qui connaissant l'adresse :
 * le droit d'agir est revérifié avant tout (la base le revérifie encore elle-même).
 */
async function estAdministrateurVerifie() {
  return regleAcces(await lireAgentConnecte(), "admin").autorise;
}

/** « Programmer pour les 4 entités » (après confirmation de l'aperçu). */
export async function programmer(saisie: SaisieTarif): Promise<ResultatProgrammation> {
  if (!(await estAdministrateurVerifie())) return { ok: false, message: MESSAGES_GRILLE.refus };
  const s = saisie ?? ({} as SaisieTarif);
  const resultat = await programmerTarifCommun(await creerClientServeur(), {
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

/** « Annuler… » sur un changement programmé (pas encore en vigueur). */
export async function annuler(id: string): Promise<ResultatAnnulation> {
  if (!(await estAdministrateurVerifie())) return { ok: false, message: MESSAGES_GRILLE.refus };
  const resultat = await annulerTarifCommun(await creerClientServeur(), String(id));
  if (resultat.ok) refresh();
  return resultat;
}
