/**
 * RÉINITIALISATION DU MOT DE PASSE ET DÉSACTIVATION D'UN COMPTE (fichier 22)
 *
 * RÉINITIALISATION (mot de passe oublié ou peut-être découvert) :
 *   1. nouveau mot de passe provisoire enregistré dans Supabase, qui ferme
 *      aussitôt toutes les sessions ouvertes de l'agent ;
 *   2. PUIS obligation de le changer posée dans le logiciel (cet ordre permet
 *      à la base de noter l'empreinte du NOUVEAU provisoire, migration 14).
 *      Dès cet instant, l'agent n'a plus aucun droit sur les données tant qu'il
 *      n'a pas choisi son nouveau mot de passe (migration 16).
 *
 * DÉSACTIVATION (départ ou remplacement d'un agent) :
 *   1. compte désactivé dans le logiciel : il perd tous ses droits, prend son
 *      nom d'archive (« bavira.caissier.ancien20261014 », fichier 13) et son
 *      poste redevient « À créer » ; l'historique est conservé ;
 *   2. compte de connexion bloqué dans Supabase (connexion et renouvellement
 *      refusés) et renommé avec le nom d'archive, ce qui libère le nom habituel
 *      pour le remplaçant.
 *
 * Seuls les comptes d'officier et de caissier sont concernés : l'administrateur
 * ne se gère pas depuis cet écran.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { genererMotDePasseProvisoire } from "./creation-compte";
import { adresseInterne } from "./identifiants";

/** Durée du blocage d'un compte désactivé (100 ans : définitif en pratique). */
const BLOCAGE = "876000h";

export const MESSAGES_GESTION = {
  introuvable: "Ce compte n'existe pas ou n'est plus actif.",
  administrateur: "Le compte de l'administrateur ne se gère pas depuis cet écran.",
  refus: "La base a refusé l'opération : vérifiez que vous êtes toujours connecté avec votre code de vérification.",
  reinitialisationIncomplete:
    "Le nouveau mot de passe a été enregistré, mais l'opération n'est pas terminée. Recommencez la réinitialisation.",
  blocageIncomplet:
    "Le compte est désactivé dans le logiciel (il n'a plus aucun droit), mais le blocage de sa connexion n'a pas abouti. Recommencez la désactivation.",
  inattendu: "L'opération a échoué pour une raison inattendue. Réessayez.",
} as const;

interface Cible {
  id: string;
  nom_utilisateur: string;
  nom_complet: string;
  role: string;
  actif: boolean;
}

export type ResultatReinitialisation =
  | { ok: true; motDePasse: string; nomUtilisateur: string; nomComplet: string }
  | { ok: false; message: string };

export type ResultatDesactivation = { ok: true; nomArchive: string; nomComplet: string } | { ok: false; message: string };

async function lireCible(session: SupabaseClient, id: string): Promise<Cible | { erreur: string }> {
  const { data, error } = await session
    .from("utilisateurs")
    .select("id, nom_utilisateur, nom_complet, role, actif")
    .eq("id", id)
    .maybeSingle<Cible>();
  if (error) return { erreur: MESSAGES_GESTION.refus };
  if (!data || !data.actif) return { erreur: MESSAGES_GESTION.introuvable };
  if (data.role === "admin") return { erreur: MESSAGES_GESTION.administrateur };
  return data;
}

/**
 * Nouveau mot de passe provisoire pour un agent.
 * @param session client de l'administrateur connecté (ses droits s'appliquent)
 * @param service client avec la clé de service (compte de connexion seulement)
 */
export async function reinitialiserMotDePasse(
  session: SupabaseClient,
  service: SupabaseClient,
  id: string,
): Promise<ResultatReinitialisation> {
  const cible = await lireCible(session, id);
  if ("erreur" in cible) return { ok: false, message: cible.erreur };

  // 1. Supabase : nouveau mot de passe, sessions ouvertes fermées
  const motDePasse = genererMotDePasseProvisoire();
  const { error: erreurAuth } = await service.auth.admin.updateUserById(id, { password: motDePasse });
  if (erreurAuth) return { ok: false, message: MESSAGES_GESTION.inattendu };

  // 2. Logiciel : obligation de le changer (empreinte du nouveau provisoire, journal d'audit)
  const { data: modifie, error } = await session
    .from("utilisateurs")
    .update({ doit_changer_mot_de_passe: true })
    .eq("id", id)
    .eq("actif", true)
    .select("id");
  if (error || !modifie?.length) return { ok: false, message: MESSAGES_GESTION.reinitialisationIncomplete };

  return { ok: true, motDePasse, nomUtilisateur: cible.nom_utilisateur, nomComplet: cible.nom_complet };
}

/** Désactive le compte d'un agent (voir l'en-tête du fichier). */
export async function desactiverCompte(
  session: SupabaseClient,
  service: SupabaseClient,
  id: string,
): Promise<ResultatDesactivation> {
  const cible = await lireCible(session, id);
  if ("erreur" in cible) {
    // Déjà désactivé dans le logiciel ? On termine le blocage s'il avait échoué.
    const reprise = await terminerBlocage(session, service, id);
    return reprise ?? { ok: false, message: cible.erreur };
  }

  // 1. Logiciel : désactivation (renommage, journal d'audit)
  const { data: modifie, error } = await session
    .from("utilisateurs")
    .update({ actif: false })
    .eq("id", id)
    .eq("actif", true)
    .select("nom_utilisateur");
  if (error || !modifie?.length) return { ok: false, message: MESSAGES_GESTION.refus };
  const nomArchive = modifie[0].nom_utilisateur as string;

  // 2. Supabase : connexion bloquée, nom habituel libéré
  const { error: erreurAuth } = await service.auth.admin.updateUserById(id, {
    email: adresseInterne(nomArchive),
    ban_duration: BLOCAGE,
  });
  if (erreurAuth) return { ok: false, message: MESSAGES_GESTION.blocageIncomplet };

  return { ok: true, nomArchive, nomComplet: cible.nom_complet };
}

/** Compte déjà désactivé dont le blocage avait échoué : on le termine. */
async function terminerBlocage(
  session: SupabaseClient,
  service: SupabaseClient,
  id: string,
): Promise<ResultatDesactivation | null> {
  const { data } = await session
    .from("utilisateurs")
    .select("nom_utilisateur, nom_complet, role, actif")
    .eq("id", id)
    .maybeSingle<Cible>();
  if (!data || data.actif || data.role === "admin") return null;
  const { error } = await service.auth.admin.updateUserById(id, {
    email: adresseInterne(data.nom_utilisateur),
    ban_duration: BLOCAGE,
  });
  if (error) return { ok: false, message: MESSAGES_GESTION.blocageIncomplet };
  return { ok: true, nomArchive: data.nom_utilisateur, nomComplet: data.nom_complet };
}
