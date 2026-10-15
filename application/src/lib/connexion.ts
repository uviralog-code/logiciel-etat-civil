/**
 * CONNEXION D'UN AGENT
 *
 * La connexion se fait depuis le navigateur de l'agent, directement auprès de
 * Supabase. Ainsi Supabase voit la vraie adresse de l'ordinateur : elle est
 * notée dans le journal des connexions, et la limite anti-essais répétés
 * s'applique poste par poste (et non au serveur entier).
 *
 * Étapes :
 *   1. contrôle du nom saisi ;
 *   2. vérification du mot de passe par Supabase ;
 *   3. lecture du profil dans le logiciel (rôle, compte actif ?) ;
 *   4. inscription au journal des connexions — réussite ou échec, avec le motif ;
 *   5. choix de la page suivante selon le profil.
 *
 * Toute réussite est inscrite au journal : si l'inscription échoue, la
 * session est refermée (« Toute connexion est enregistrée »).
 */
import { isAuthApiError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { RoleUtilisateur } from "./charte";
import { adresseInterne, estNomUtilisateurValide, normaliserNomUtilisateur } from "./identifiants";

export interface ProfilAgent {
  nomUtilisateur: string;
  nomComplet: string;
  role: RoleUtilisateur;
  doitChangerMotDePasse: boolean;
  doubleVerification: boolean;
  entite: { code: string; nom: string } | null;
}

export type ResultatConnexion =
  | { ok: true; destination: string; profil: ProfilAgent }
  | { ok: false; message: string; champ?: "nom" | "motDePasse" };

export interface ContexteConnexion {
  /** Description courte du navigateur (voir decrireNavigateur). */
  navigateur?: string | null;
  /** Nom ou identifiant de l'ordinateur, s'il est connu. */
  poste?: string | null;
}

/** Messages affichés à l'agent. */
export const MESSAGES = {
  nomVide: "Saisissez votre nom d'utilisateur.",
  motDePasseVide: "Saisissez votre mot de passe.",
  nomMalForme:
    "Le nom d'utilisateur ne contient que des lettres minuscules, des chiffres et des points (exemple : mulongwe.officier).",
  identifiants: "Nom d'utilisateur ou mot de passe incorrect.",
  tropDEssais: "Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer.",
  compteDesactive: "Ce compte est désactivé. Adressez-vous à l'administrateur (CDJP).",
  sansProfil: "Ce compte n'est pas encore activé dans le logiciel. Adressez-vous à l'administrateur (CDJP).",
  injoignable:
    "Le serveur est injoignable. Vérifiez la connexion à internet (câble, Wi-Fi ou clé internet), puis réessayez.",
  journal:
    "La connexion n'a pas pu être inscrite au journal : par sécurité, elle a été annulée. Réessayez dans un instant.",
  inattendu: "La connexion a échoué pour une raison inattendue. Réessayez ; si cela continue, prévenez l'administrateur.",
} as const;

/** Espace de travail de chaque rôle. */
export function espaceDuRole(role: RoleUtilisateur): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "officier":
      return "/officier";
    case "caissier":
      return "/caissier";
  }
}

/**
 * Page où envoyer l'agent juste après sa connexion :
 * mot de passe provisoire à remplacer (fichier 17), puis code de vérification
 * pour les comptes qui en ont un (l'administrateur ; fichier 18), puis son espace.
 */
export function destinationApresConnexion(
  profil: Pick<ProfilAgent, "role" | "doitChangerMotDePasse" | "doubleVerification">,
): string {
  if (profil.doitChangerMotDePasse) return "/mot-de-passe";
  if (profil.doubleVerification) return "/verification";
  return espaceDuRole(profil.role);
}

/** « Chrome 140 · Windows », « Firefox 128 · Android »… (pour le journal des connexions). */
export function decrireNavigateur(agent: string | null | undefined): string | null {
  if (!agent) return null;
  const navigateurs: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
  ];
  const systemes: [RegExp, string][] = [
    [/Windows/, "Windows"],
    [/Android/, "Android"],
    [/iPhone|iPad|iPod/, "iOS"],
    [/Mac OS X|Macintosh/, "macOS"],
    [/CrOS/, "ChromeOS"],
    [/Linux/, "Linux"],
  ];
  let nom = "Navigateur inconnu";
  for (const [motif, libelle] of navigateurs) {
    const m = agent.match(motif);
    if (m) {
      nom = `${libelle} ${m[1]}`;
      break;
    }
  }
  const systeme = systemes.find(([motif]) => motif.test(agent))?.[1];
  return systeme ? `${nom} · ${systeme}` : nom;
}

/** Colonnes du profil lues dans la base (chacun ne peut lire que le sien). */
export const SELECTION_PROFIL =
  "nom_utilisateur, nom_complet, role, actif, doit_changer_mot_de_passe, double_verification, entite:entites(code, nom)";

export interface LigneProfil {
  nom_utilisateur: string;
  nom_complet: string;
  role: RoleUtilisateur;
  actif: boolean;
  doit_changer_mot_de_passe: boolean;
  double_verification: boolean;
  entite: { code: string; nom: string } | null;
}

export async function connecterAgent(
  supabase: SupabaseClient,
  saisie: { nom: string; motDePasse: string },
  contexte: ContexteConnexion = {},
): Promise<ResultatConnexion> {
  const nom = normaliserNomUtilisateur(saisie.nom ?? "");
  const motDePasse = saisie.motDePasse ?? "";

  // Champs vides : rien n'est envoyé (le formulaire l'empêche déjà)
  if (!nom) return { ok: false, message: MESSAGES.nomVide, champ: "nom" };
  if (!motDePasse) return { ok: false, message: MESSAGES.motDePasseVide, champ: "motDePasse" };

  const noterEchec = async (motif: string) => {
    // Un échec qui ne peut pas être noté (réseau coupé…) ne bloque pas le message à l'agent
    try {
      await supabase.rpc("journaliser_connexion", {
        p_nom_utilisateur: saisie.nom.trim() || nom,
        p_succes: false,
        p_motif_echec: motif,
        p_navigateur: contexte.navigateur ?? null,
        p_poste: contexte.poste ?? null,
      });
    } catch {
      /* rien de plus à faire */
    }
  };

  // 1. Format du nom
  if (!estNomUtilisateurValide(nom)) {
    await noterEchec("nom d'utilisateur mal formé");
    return { ok: false, message: MESSAGES.nomMalForme, champ: "nom" };
  }

  // 2. Mot de passe vérifié par Supabase
  const { data: connexion, error: refus } = await supabase.auth.signInWithPassword({
    email: adresseInterne(nom),
    password: motDePasse,
  });

  if (refus || !connexion.user) {
    if (isAuthRetryableFetchError(refus)) {
      return { ok: false, message: MESSAGES.injoignable };
    }
    if (isAuthApiError(refus)) {
      if (refus.code === "invalid_credentials") {
        await noterEchec("nom d'utilisateur ou mot de passe incorrect");
        return { ok: false, message: MESSAGES.identifiants, champ: "motDePasse" };
      }
      if (refus.code === "over_request_rate_limit" || refus.status === 429) {
        await noterEchec("trop de tentatives");
        return { ok: false, message: MESSAGES.tropDEssais };
      }
      if (refus.code === "user_banned") {
        await noterEchec("compte désactivé (bloqué)");
        return { ok: false, message: MESSAGES.compteDesactive };
      }
    }
    await noterEchec(`erreur du service de connexion${refus?.code ? ` (${refus.code})` : ""}`);
    return { ok: false, message: MESSAGES.inattendu };
  }

  // 3. Profil dans le logiciel (chacun ne peut lire que le sien)
  const { data: ligne, error: erreurProfil } = await supabase
    .from("utilisateurs")
    .select(SELECTION_PROFIL)
    .eq("id", connexion.user.id)
    .maybeSingle<LigneProfil>();

  const refuser = async (motif: string, message: string) => {
    await noterEchec(motif);
    await supabase.auth.signOut();
    return { ok: false as const, message };
  };

  if (erreurProfil) return refuser("profil illisible", MESSAGES.inattendu);
  if (!ligne) return refuser("compte sans profil dans le logiciel", MESSAGES.sansProfil);
  if (!ligne.actif) return refuser("compte désactivé", MESSAGES.compteDesactive);

  // 4. Inscription au journal (obligatoire)
  const { error: erreurJournal } = await supabase.rpc("journaliser_connexion", {
    p_nom_utilisateur: nom,
    p_succes: true,
    p_navigateur: contexte.navigateur ?? null,
    p_poste: contexte.poste ?? null,
  });
  if (erreurJournal) {
    await supabase.auth.signOut({ scope: "local" }); // seulement cette session-ci
    return { ok: false, message: MESSAGES.journal };
  }

  // 5. Page suivante
  const profil = profilDepuisLigne(ligne);
  return { ok: true, destination: destinationApresConnexion(profil), profil };
}

/** Profil lisible par l'application, à partir d'une ligne de la base. */
export function profilDepuisLigne(ligne: LigneProfil): ProfilAgent {
  return {
    nomUtilisateur: ligne.nom_utilisateur,
    nomComplet: ligne.nom_complet,
    role: ligne.role,
    doitChangerMotDePasse: ligne.doit_changer_mot_de_passe,
    doubleVerification: ligne.double_verification,
    entite: ligne.entite,
  };
}
