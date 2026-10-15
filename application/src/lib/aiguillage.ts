/**
 * AIGUILLAGE ET PROTECTION DES PAGES
 *
 * Règles (dans cet ordre) pour entrer dans un espace de travail :
 *   1. personne connecté ou compte sans profil             → connexion ;
 *      compte désactivé (session encore ouverte)          → session fermée, puis connexion avec explication ;
 *   2. mot de passe provisoire pas encore remplacé        → /mot-de-passe ;
 *   3. code à 6 chiffres exigé et pas encore validé        → /verification ;
 *   4. espace d'un autre rôle                              → son propre espace ;
 *   5. sinon : accès autorisé.
 *
 * Ces règles servent deux fois :
 *   - dans le proxy, en version rapide (session présente ou non) ;
 *   - dans chaque page, en version complète (profil lu dans la base).
 * La base de données applique de toute façon ses propres règles (fichiers 08 et 15).
 */
import type { RoleUtilisateur } from "./charte";
import { espaceDuRole, type ProfilAgent } from "./connexion";

/** Pages ouvertes sans être connecté. */
/** « /photo » : page du téléphone ouverte par le QR code (sans mot de passe, lien secret de 10 minutes, fichier 34). */
export const PAGES_PUBLIQUES = ["/connexion", "/deconnexion", "/photo", "/verifier"] as const;

/** Adresse qui ferme la session d'un compte désactivé et l'explique à l'écran de connexion. */
export const DECONNEXION_COMPTE_DESACTIVE = "/deconnexion?motif=desactive";

export interface EtatAgent {
  actif: boolean;
  niveau: "aal1" | "aal2";
  profil: Pick<ProfilAgent, "role" | "doitChangerMotDePasse" | "doubleVerification">;
}

export type Decision = { autorise: true } | { autorise: false; redirection: string };

/** Vrai si la page demande d'être connecté. */
export function estProtege(chemin: string): boolean {
  return !PAGES_PUBLIQUES.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/** Rôle auquel appartient une page (« /officier/actes » → officier), ou vide. */
export function roleDuChemin(chemin: string): RoleUtilisateur | null {
  const premier = chemin.split("/")[1];
  return premier === "admin" || premier === "officier" || premier === "caissier" ? premier : null;
}

/** Peut-on entrer dans l'espace de ce rôle ? Sinon, où aller ? */
export function regleAcces(agent: EtatAgent | null, roleExige: RoleUtilisateur): Decision {
  if (!agent) return { autorise: false, redirection: "/connexion" };
  if (!agent.actif) return { autorise: false, redirection: DECONNEXION_COMPTE_DESACTIVE };
  const { profil } = agent;
  if (profil.doitChangerMotDePasse) return { autorise: false, redirection: "/mot-de-passe" };
  if (profil.doubleVerification && agent.niveau !== "aal2") return { autorise: false, redirection: "/verification" };
  if (profil.role !== roleExige) return { autorise: false, redirection: espaceDuRole(profil.role) };
  return { autorise: true };
}

/** Où envoyer quelqu'un qui arrive sur l'adresse principale (« / ») du logiciel. */
export function pageDAccueil(agent: EtatAgent | null): string {
  if (!agent) return "/connexion";
  const decision = regleAcces(agent, agent.profil.role);
  return decision.autorise ? espaceDuRole(agent.profil.role) : decision.redirection;
}

/**
 * Après une connexion, revenir à la page où l'agent se trouvait (session expirée
 * en plein travail) — seulement si elle est dans SON espace. Toute autre adresse
 * (autre espace, autre site : « //exemple.com », « https://… ») est ignorée.
 */
export function destinationFinale(destination: string, suite: string | null | undefined): string {
  if (!suite || !suite.startsWith("/") || suite.startsWith("//") || suite.includes("\\")) return destination;
  const espace = ["/admin", "/officier", "/caissier"].find((e) => destination === e);
  if (!espace) return destination; // mot de passe à remplacer, code à taper… : on suit le parcours normal
  const chemin = suite.split(/[?#]/)[0];
  return chemin === espace || chemin.startsWith(`${espace}/`) ? suite : destination;
}

/** Adresse de connexion qui mémorise la page demandée (sauf l'adresse principale). */
export function adresseConnexion(cheminDemande: string, recherche = ""): string {
  if (cheminDemande === "/" || !estProtege(cheminDemande)) return "/connexion";
  return `/connexion?suite=${encodeURIComponent(cheminDemande + recherche)}`;
}
