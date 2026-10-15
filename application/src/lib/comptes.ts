/**
 * LISTE DES COMPTES (espace de l'administrateur, fichier 20)
 *
 * Pour chaque entité, dans l'ordre de la maquette :
 *   - l'officier puis le caissier actifs ;
 *   - à la place d'un agent manquant, une ligne « À créer » ;
 *   - puis les anciens comptes désactivés (conservés pour l'historique).
 *
 * L'état de chaque compte tient compte de la règle des 7 jours hors-ligne
 * (fichier 02) : sans connexion en ligne depuis 7 jours, le travail sans
 * internet est bloqué sur ce poste jusqu'à la prochaine connexion en ligne.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleUtilisateur } from "./charte";

export const FUSEAU = "Africa/Lubumbashi";
const JOUR = 24 * 60 * 60 * 1000;
/** Durée maximale de travail sans internet (règle des 7 jours). */
export const JOURS_HORS_LIGNE = 7;
/** À partir de combien de jours sans connexion en ligne on prévient l'administrateur. */
const ALERTE_APRES_JOURS = 5;

/** Ordre d'affichage des entités (celui de la maquette). */
export const ORDRE_ENTITES = ["MUL", "KAV", "KAL", "BAV"];
const ROLES_AGENTS: Exclude<RoleUtilisateur, "admin">[] = ["officier", "caissier"];

export interface LigneCompte {
  id: string;
  nom_utilisateur: string;
  nom_complet: string;
  role: RoleUtilisateur;
  actif: boolean;
  doit_changer_mot_de_passe: boolean;
  derniere_connexion_en_ligne: string | null;
  desactive_le: string | null;
  entite: { code: string; nom: string } | null;
}

export interface Entite {
  id: string;
  code: string;
  nom: string;
}

export type Ton = "ok" | "attention" | "bloque" | "eteint";

export interface EtatCompte {
  libelle: string;
  ton: Ton;
}

export type RangeeCompte =
  | { type: "compte"; compte: LigneCompte; entite: Entite; etat: EtatCompte; derniereConnexion: string }
  | { type: "a-creer"; role: Exclude<RoleUtilisateur, "admin">; entite: Entite };

export interface ListeComptes {
  rangees: RangeeCompte[];
  totaux: { actifs: number; aCreer: number; desactives: number; alertes: number };
}

/** « Commune de Mulongwe » → « Mulongwe » ; « Chefferie des Bavira » → « Bavira ». */
export function nomCourt(nom: string): string {
  return nom.replace(/^(Commune|Chefferie)\s+(de la|de l'|des|du|de|d')\s*/i, "");
}

const heure = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: FUSEAU })
    .format(d)
    .replace(":", " h ");
const jourCalendaire = (d: Date) =>
  new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: FUSEAU }).format(d);
const dateCourte = (d: Date, avecAnnee = true) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    ...(avecAnnee ? { year: "numeric" } : {}),
    timeZone: FUSEAU,
  }).format(d);

/** Nombre de jours de calendrier (heure de Lubumbashi) entre deux instants. */
function joursDeCalendrier(avant: Date, apres: Date): number {
  const a = Date.parse(jourCalendaire(avant));
  const b = Date.parse(jourCalendaire(apres));
  return Math.round((b - a) / JOUR);
}

/** « aujourd'hui 07 h 52 », « hier 16 h 20 », « il y a 6 jours », « 02/10/2026 », « — ». */
export function formaterDerniereConnexion(quand: string | null, maintenant = new Date()): string {
  if (!quand) return "—";
  const d = new Date(quand);
  const ecart = joursDeCalendrier(d, maintenant);
  if (ecart <= 0) return `aujourd'hui ${heure(d)}`;
  if (ecart === 1) return `hier ${heure(d)}`;
  if (ecart < JOURS_HORS_LIGNE + 1) return `il y a ${ecart} jours`;
  return dateCourte(d);
}

/** État affiché dans la colonne « État ». */
export function etatCompte(c: LigneCompte, maintenant = new Date()): EtatCompte {
  if (!c.actif) {
    return {
      libelle: c.desactive_le ? `Désactivé le ${dateCourte(new Date(c.desactive_le), false)}` : "Désactivé",
      ton: "eteint",
    };
  }
  if (!c.derniere_connexion_en_ligne) {
    return { libelle: c.doit_changer_mot_de_passe ? "Première connexion attendue" : "Jamais connecté", ton: "attention" };
  }
  const ecoule = maintenant.getTime() - new Date(c.derniere_connexion_en_ligne).getTime();
  const reste = JOURS_HORS_LIGNE * JOUR - ecoule;
  if (reste <= 0) return { libelle: "Hors-ligne bloqué", ton: "bloque" };
  if (ecoule >= ALERTE_APRES_JOURS * JOUR) {
    const jours = Math.ceil(reste / JOUR);
    return { libelle: `Hors-ligne : reste ${jours} jour${jours > 1 ? "s" : ""}`, ton: "attention" };
  }
  if (c.doit_changer_mot_de_passe) return { libelle: "Mot de passe provisoire", ton: "attention" };
  return { libelle: "Actif", ton: "ok" };
}

/** Range les comptes pour l'affichage (voir l'en-tête du fichier). L'administrateur n'y figure pas. */
export function organiserComptes(comptes: LigneCompte[], entites: Entite[], maintenant = new Date()): ListeComptes {
  const ordre = (e: Entite) => {
    const i = ORDRE_ENTITES.indexOf(e.code);
    return i < 0 ? ORDRE_ENTITES.length : i;
  };
  const triees = [...entites].sort((a, b) => ordre(a) - ordre(b) || a.nom.localeCompare(b.nom, "fr"));
  const rangees: RangeeCompte[] = [];
  const totaux = { actifs: 0, aCreer: 0, desactives: 0, alertes: 0 };

  const rangee = (compte: LigneCompte, entite: Entite): RangeeCompte => {
    const etat = etatCompte(compte, maintenant);
    if (compte.actif) totaux.actifs++;
    else totaux.desactives++;
    if (etat.ton === "attention" || etat.ton === "bloque") totaux.alertes++;
    return { type: "compte", compte, entite, etat, derniereConnexion: formaterDerniereConnexion(compte.derniere_connexion_en_ligne, maintenant) };
  };

  for (const entite of triees) {
    const siens = comptes.filter((c) => c.role !== "admin" && c.entite?.code === entite.code);
    for (const role of ROLES_AGENTS) {
      const actif = siens.find((c) => c.role === role && c.actif);
      if (actif) rangees.push(rangee(actif, entite));
      else {
        rangees.push({ type: "a-creer", role, entite });
        totaux.aCreer++;
      }
    }
    const anciens = siens
      .filter((c) => !c.actif)
      .sort((a, b) => (b.desactive_le ?? "").localeCompare(a.desactive_le ?? ""));
    for (const ancien of anciens) rangees.push(rangee(ancien, entite));
  }
  return { rangees, totaux };
}

/** Lit les comptes et les entités (réservé à l'administrateur vérifié : la base l'impose). */
export async function lireComptes(supabase: SupabaseClient, maintenant = new Date()): Promise<ListeComptes> {
  const [comptes, entites] = await Promise.all([
    supabase
      .from("utilisateurs")
      .select(
        "id, nom_utilisateur, nom_complet, role, actif, doit_changer_mot_de_passe, derniere_connexion_en_ligne, desactive_le, entite:entites(code, nom)",
      )
      .returns<LigneCompte[]>(),
    supabase.from("entites").select("id, code, nom").returns<Entite[]>(),
  ]);
  if (comptes.error) throw new Error(`Lecture des comptes impossible : ${comptes.error.message}`);
  if (entites.error) throw new Error(`Lecture des entités impossible : ${entites.error.message}`);
  return organiserComptes(comptes.data ?? [], entites.data ?? [], maintenant);
}
