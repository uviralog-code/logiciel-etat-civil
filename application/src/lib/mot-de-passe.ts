/**
 * CHANGEMENT DU MOT DE PASSE PROVISOIRE
 *
 * Après la création de son compte ou une réinitialisation par l'administrateur,
 * l'agent doit remplacer le mot de passe provisoire avant de commencer.
 *
 * Étapes :
 *   1. contrôle des règles (au moins 10 caractères, deux saisies identiques) ;
 *   2. enregistrement du nouveau mot de passe par Supabase — qui refuse aussi
 *      un mot de passe identique au provisoire ou trop court, et ferme les
 *      autres sessions ouvertes avec l'ancien mot de passe ;
 *   3. levée de l'obligation dans le logiciel (fonction mot_de_passe_change,
 *      fichier 08), notée automatiquement au journal d'audit.
 */
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
  type SupabaseClient,
} from "@supabase/supabase-js";

/** Longueur minimale (à régler aussi sur le projet Supabase : voir README). */
export const LONGUEUR_MINIMALE = 10;

export interface Regle {
  id: "longueur" | "identiques";
  libelle: string;
  respectee: boolean;
}

/** Les règles affichées sous les champs, cochées au fur et à mesure de la saisie. */
export function reglesMotDePasse(nouveau: string, confirmation: string): Regle[] {
  return [
    {
      id: "longueur",
      libelle: `Au moins ${LONGUEUR_MINIMALE} caractères`,
      respectee: [...nouveau].length >= LONGUEUR_MINIMALE,
    },
    {
      id: "identiques",
      libelle: "Les deux saisies sont identiques",
      respectee: nouveau.length > 0 && nouveau === confirmation,
    },
  ];
}

export const MESSAGES_MDP = {
  tropCourt: `Le mot de passe doit contenir au moins ${LONGUEUR_MINIMALE} caractères.`,
  differents: "Les deux saisies ne sont pas identiques. Retapez la confirmation.",
  identiqueAuProvisoire: "Le nouveau mot de passe doit être différent du mot de passe provisoire.",
  refuseTropFaible: "Ce mot de passe est refusé car trop faible. Choisissez-en un plus long.",
  sessionExpiree: "Votre session a expiré. Reconnectez-vous avec le mot de passe provisoire.",
  injoignable:
    "Le serveur est injoignable. Vérifiez la connexion à internet (câble, Wi-Fi ou clé internet), puis réessayez.",
  finIncomplete:
    "Votre nouveau mot de passe est bien enregistré, mais l'opération n'est pas terminée. Cliquez à nouveau sur « Enregistrer et continuer ».",
  inattendu: "L'enregistrement a échoué pour une raison inattendue. Réessayez ; si cela continue, prévenez l'administrateur.",
} as const;

export type ResultatChangement =
  | { ok: true }
  | {
      ok: false;
      message: string;
      champ?: "nouveau" | "confirmation";
      /** Le mot de passe est déjà changé : au prochain essai, seule la fin de l'opération est refaite. */
      motDePasseEnregistre?: boolean;
      /** La session n'existe plus : il faut se reconnecter. */
      reconnexion?: boolean;
    };

export async function changerMotDePasse(
  supabase: SupabaseClient,
  saisie: { nouveau: string; confirmation: string },
  options: { motDePasseDejaEnregistre?: boolean } = {},
): Promise<ResultatChangement> {
  // 1. Règles
  if (!options.motDePasseDejaEnregistre) {
    const [longueur, identiques] = reglesMotDePasse(saisie.nouveau, saisie.confirmation);
    if (!longueur.respectee) return { ok: false, message: MESSAGES_MDP.tropCourt, champ: "nouveau" };
    if (!identiques.respectee) return { ok: false, message: MESSAGES_MDP.differents, champ: "confirmation" };

    // 2. Nouveau mot de passe enregistré par Supabase
    const { error } = await supabase.auth.updateUser({ password: saisie.nouveau });
    if (error) {
      if (isAuthRetryableFetchError(error)) return { ok: false, message: MESSAGES_MDP.injoignable };
      if (isAuthSessionMissingError(error)) return { ok: false, message: MESSAGES_MDP.sessionExpiree, reconnexion: true };
      if (isAuthWeakPasswordError(error)) return { ok: false, message: MESSAGES_MDP.refuseTropFaible, champ: "nouveau" };
      if (isAuthApiError(error)) {
        if (error.code === "same_password") {
          return { ok: false, message: MESSAGES_MDP.identiqueAuProvisoire, champ: "nouveau" };
        }
        if (error.status === 401 || error.code === "session_not_found" || error.code === "bad_jwt") {
          return { ok: false, message: MESSAGES_MDP.sessionExpiree, reconnexion: true };
        }
      }
      return { ok: false, message: MESSAGES_MDP.inattendu };
    }
  }

  // 3. L'obligation est levée dans le logiciel
  const { error: erreurFin } = await supabase.rpc("mot_de_passe_change");
  if (erreurFin) return { ok: false, message: MESSAGES_MDP.finIncomplete, motDePasseEnregistre: true };

  return { ok: true };
}
