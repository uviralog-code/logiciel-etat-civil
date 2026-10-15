"use server";

import { refresh } from "next/cache";
import { regleAcces } from "@/lib/aiguillage";
import { creerCompteAgent, type ResultatCreation } from "@/lib/creation-compte";
import {
  desactiverCompte,
  reinitialiserMotDePasse,
  type ResultatDesactivation,
  type ResultatReinitialisation,
} from "@/lib/gestion-compte";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientAdmin } from "@/lib/supabase/admin";
import { creerClientServeur } from "@/lib/supabase/serveur";

export type EtatCreation = ResultatCreation | { ok: null };

/*
 * Une action serveur peut être appelée par n'importe qui connaissant l'adresse :
 * dans chaque action, le droit d'agir est donc revérifié avant tout.
 */
const REFUS = { ok: false as const, message: "Action réservée à l'administrateur connecté avec son code de vérification." };

async function estAdministrateurVerifie() {
  return regleAcces(await lireAgentConnecte(), "admin").autorise;
}

/** Création d'un compte (formulaire « Créer un compte », fichier 21). */
export async function creerCompte(_precedent: EtatCreation, donnees: FormData): Promise<EtatCreation> {
  if (!(await estAdministrateurVerifie())) return REFUS;

  const resultat = await creerCompteAgent(await creerClientServeur(), creerClientAdmin(), {
    entite: String(donnees.get("entite") ?? ""),
    role: String(donnees.get("role") ?? ""),
    nomComplet: String(donnees.get("nomComplet") ?? ""),
    nomUtilisateur: String(donnees.get("nomUtilisateur") ?? ""),
  });

  // Le tableau des comptes est remis à jour dans la même réponse
  if (resultat.ok) refresh();
  return resultat;
}

/** « Mot de passe… » : nouveau mot de passe provisoire pour un agent (fichier 22). */
export async function reinitialiser(id: string): Promise<ResultatReinitialisation> {
  if (!(await estAdministrateurVerifie())) return REFUS;
  const resultat = await reinitialiserMotDePasse(await creerClientServeur(), creerClientAdmin(), String(id));
  if (resultat.ok) refresh();
  return resultat;
}

/** « Désactiver » : départ ou remplacement d'un agent (fichier 22). */
export async function desactiver(id: string): Promise<ResultatDesactivation> {
  if (!(await estAdministrateurVerifie())) return REFUS;
  const resultat = await desactiverCompte(await creerClientServeur(), creerClientAdmin(), String(id));
  if (resultat.ok) refresh();
  return resultat;
}
