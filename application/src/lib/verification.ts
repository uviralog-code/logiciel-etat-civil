/**
 * CODE DE VÉRIFICATION À 6 CHIFFRES (double vérification)
 *
 * Obligatoire pour l'administrateur. Le code est affiché par une application
 * d'authentification sur son téléphone (Google Authenticator, Microsoft
 * Authenticator…) et change toutes les 30 secondes.
 *
 * Deux situations :
 *   - MISE EN PLACE (première fois) : Supabase crée une clé secrète, montrée
 *     sous forme de QR code à scanner avec le téléphone ; le premier code
 *     tapé confirme que le téléphone est bien relié ;
 *   - VÉRIFICATION (connexions suivantes) : l'administrateur tape le code.
 *
 * Une fois le code validé, la session passe au niveau « aal2 » : la base
 * (migration 15) reconnaît alors seulement les droits d'administrateur.
 */
import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";

/** Nom affiché dans l'application du téléphone. */
export const EMETTEUR = "État civil Uvira";
const NOM_DU_TELEPHONE = "Téléphone de l'administrateur";

export const MESSAGES_CODE = {
  format: "Le code comporte exactement 6 chiffres.",
  incorrect:
    "Code incorrect. Tapez le code affiché en ce moment sur le téléphone. S'il est refusé plusieurs fois, vérifiez que l'heure du téléphone est réglée automatiquement.",
  expire: "Le délai est dépassé. Tapez le nouveau code affiché sur le téléphone.",
  tropDEssais: "Trop d'essais. Patientez une minute avant de réessayer.",
  injoignable:
    "Le serveur est injoignable. Vérifiez la connexion à internet (câble, Wi-Fi ou clé internet), puis réessayez.",
  sessionExpiree: "Votre session a expiré. Reconnectez-vous.",
  aucunTelephone: "Aucun téléphone n'est encore relié à ce compte. Rechargez la page pour le mettre en place.",
  inattendu: "La vérification a échoué pour une raison inattendue. Réessayez ; si cela continue, contactez le service technique de la CDJP.",
} as const;

export interface MiseEnPlace {
  idFacteur: string;
  /** Image du QR code (format SVG, prête à afficher). */
  qrCode: string;
  /** Clé à saisir à la main si le QR code ne peut pas être scanné. */
  cle: string;
}

export type ResultatMiseEnPlace = { ok: true; miseEnPlace: MiseEnPlace } | { ok: false; message: string; reconnexion?: boolean };
export type ResultatVerification =
  | { ok: true }
  | { ok: false; message: string; reconnexion?: boolean; recommencer?: boolean };

/** La clé secrète, en groupes de 4 caractères pour la recopier sans erreur. */
export function cleLisible(cle: string): string {
  return cle.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? cle;
}

/** Le code tapé, sans espaces ; vide s'il n'a pas exactement 6 chiffres. */
export function nettoyerCode(saisie: string): string | null {
  const code = saisie.replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

function messageErreur(error: unknown): { message: string; reconnexion?: boolean } {
  if (isAuthRetryableFetchError(error)) return { message: MESSAGES_CODE.injoignable };
  if (isAuthApiError(error)) {
    if (error.code === "mfa_verification_failed") return { message: MESSAGES_CODE.incorrect };
    if (error.code === "mfa_challenge_expired") return { message: MESSAGES_CODE.expire };
    if (error.status === 429 || error.code === "over_request_rate_limit") return { message: MESSAGES_CODE.tropDEssais };
    if (error.status === 401 || error.code === "session_not_found" || error.code === "bad_jwt") {
      return { message: MESSAGES_CODE.sessionExpiree, reconnexion: true };
    }
  }
  if (error && typeof error === "object" && "name" in error && error.name === "AuthSessionMissingError") {
    return { message: MESSAGES_CODE.sessionExpiree, reconnexion: true };
  }
  return { message: MESSAGES_CODE.inattendu };
}

/**
 * Première étape de la mise en place : crée la clé secrète et le QR code.
 * Une mise en place abandonnée auparavant (non confirmée) est d'abord effacée.
 */
export async function commencerMiseEnPlace(supabase: SupabaseClient): Promise<ResultatMiseEnPlace> {
  const { data: facteurs, error: erreurListe } = await supabase.auth.mfa.listFactors();
  if (erreurListe) return { ok: false, ...messageErreur(erreurListe) };

  for (const ancien of facteurs.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: ancien.id });
    if (error) return { ok: false, ...messageErreur(error) };
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: EMETTEUR,
    friendlyName: NOM_DU_TELEPHONE,
  });
  if (error) return { ok: false, ...messageErreur(error) };
  return { ok: true, miseEnPlace: { idFacteur: data.id, qrCode: data.totp.qr_code, cle: data.totp.secret } };
}

/**
 * Vérifie le code tapé. Sans idFacteur, on utilise le téléphone déjà relié au compte.
 * Un code refusé est inscrit au journal des connexions.
 */
export async function verifierCode(
  supabase: SupabaseClient,
  saisie: { code: string; idFacteur?: string },
  contexte: { nomUtilisateur: string; navigateur?: string | null },
): Promise<ResultatVerification> {
  const code = nettoyerCode(saisie.code);
  if (!code) return { ok: false, message: MESSAGES_CODE.format };

  let idFacteur = saisie.idFacteur;
  if (!idFacteur) {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { ok: false, ...messageErreur(error) };
    idFacteur = data.totp[0]?.id; // « totp » ne contient que les téléphones confirmés
    if (!idFacteur) return { ok: false, message: MESSAGES_CODE.aucunTelephone, recommencer: true };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: idFacteur, code });
  if (error) {
    const erreur = messageErreur(error);
    if (erreur.message === MESSAGES_CODE.incorrect) {
      await supabase.rpc("journaliser_connexion", {
        p_nom_utilisateur: contexte.nomUtilisateur,
        p_succes: false,
        p_motif_echec: "code de vérification incorrect",
        p_navigateur: contexte.navigateur ?? null,
      });
    }
    return { ok: false, ...erreur };
  }
  return { ok: true };
}
