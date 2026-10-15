/**
 * CRÉATION D'UN COMPTE PAR L'ADMINISTRATEUR (fichier 21)
 *
 * Étapes :
 *   1. contrôles : entité et rôle valides, poste libre, nom d'utilisateur
 *      au bon format et pas encore pris, nom complet rempli ;
 *   2. mot de passe provisoire tiré au hasard (ex. « 7K4-PX9-QM2 ») ;
 *   3. compte de connexion créé dans Supabase (clé de service, côté serveur) ;
 *   4. profil créé dans le logiciel AU NOM de l'administrateur : la base vérifie
 *      qu'il en a le droit et l'inscrit au journal d'audit ; l'obligation de
 *      changer le mot de passe est posée (et son empreinte notée, migration 14) ;
 *   5. si le profil ne peut pas être créé, le compte de connexion est supprimé
 *      (rien ne reste à moitié fait).
 *
 * Nom repris d'un ancien compte : à la désactivation, le profil prend un nom
 * d'archive (« bavira.caissier.ancien20261014 », fichier 13). Si son compte de
 * connexion porte encore l'ancien nom, il reçoit ici le nom d'archive, ce qui
 * libère le nom habituel pour le nouvel agent.
 *
 * Le mot de passe provisoire n'est conservé nulle part : il est montré une
 * seule fois à l'administrateur, qui le remet à l'agent en main propre.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleUtilisateur } from "./charte";
import { nomCourt } from "./comptes";
import { adresseInterne, estNomUtilisateurValide, normaliserNomUtilisateur } from "./identifiants";

export type RoleAgent = Exclude<RoleUtilisateur, "admin">;

/** Caractères sans ambiguïté à la lecture (ni 0/O, ni 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Mot de passe provisoire : 9 caractères tirés au hasard, en 3 groupes (11 caractères, tirets compris). */
export function genererMotDePasseProvisoire(): string {
  const tirage = new Uint32Array(9);
  crypto.getRandomValues(tirage);
  // Rejet des valeurs qui fausseraient l'équiprobabilité (biais de modulo)
  const limite = Math.floor(0x1_0000_0000 / ALPHABET.length) * ALPHABET.length;
  const car: string[] = [];
  for (const v of tirage) {
    let x = v;
    while (x >= limite) x = crypto.getRandomValues(new Uint32Array(1))[0];
    car.push(ALPHABET[x % ALPHABET.length]);
  }
  return `${car.slice(0, 3).join("")}-${car.slice(3, 6).join("")}-${car.slice(6).join("")}`;
}

/** « Chefferie des Bavira » + caissier → « bavira.caissier ». */
export function nomUtilisateurPropose(nomEntite: string, role: RoleAgent): string {
  const lieu = nomCourt(nomEntite)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return `${lieu}.${role}`;
}

export interface Poste {
  entite: { id: string; code: string; nom: string };
  role: RoleAgent;
}

export interface SaisieCreation {
  entite: string; // code (MUL, KAV, KAL, BAV)
  role: string;
  nomComplet: string;
  nomUtilisateur: string;
}

export type ResultatCreation =
  | { ok: true; nomUtilisateur: string; nomComplet: string; motDePasse: string; entite: string; role: RoleAgent }
  | { ok: false; message: string; champ?: "entite" | "role" | "nomComplet" | "nomUtilisateur" };

export const MESSAGES_CREATION = {
  poste: "Choisissez l'entité et le rôle d'un poste libre.",
  posteOccupe:
    "Ce poste a déjà un agent actif. Pour le remplacer, désactivez d'abord l'ancien compte : il reste conservé pour l'historique.",
  nomComplet: "Saisissez le nom complet de l'agent (au moins 3 caractères).",
  nomUtilisateur:
    "Nom d'utilisateur invalide : lettres minuscules sans accents, chiffres et points, de 3 à 50 caractères (exemple : bavira.caissier).",
  nomPris: "Ce nom d'utilisateur est déjà pris. Choisissez-en un autre.",
  refus: "La base a refusé la création : vérifiez que vous êtes toujours connecté avec votre code de vérification.",
  inattendu: "La création a échoué pour une raison inattendue. Rien n'a été enregistré ; réessayez.",
} as const;

/**
 * Crée le compte.
 * @param session client Supabase de l'administrateur connecté (ses droits s'appliquent)
 * @param service client avec la clé de service (création du compte de connexion seulement)
 */
export async function creerCompteAgent(
  session: SupabaseClient,
  service: SupabaseClient,
  saisie: SaisieCreation,
): Promise<ResultatCreation> {
  // 1. Contrôles
  const role = saisie.role;
  if (role !== "officier" && role !== "caissier") return { ok: false, message: MESSAGES_CREATION.poste, champ: "role" };
  const nomComplet = saisie.nomComplet.trim().replace(/\s+/g, " ");
  if (nomComplet.length < 3 || nomComplet.length > 100) {
    return { ok: false, message: MESSAGES_CREATION.nomComplet, champ: "nomComplet" };
  }
  const nomUtilisateur = normaliserNomUtilisateur(saisie.nomUtilisateur);
  if (!estNomUtilisateurValide(nomUtilisateur)) {
    return { ok: false, message: MESSAGES_CREATION.nomUtilisateur, champ: "nomUtilisateur" };
  }

  const { data: entite } = await session.from("entites").select("id, code, nom").eq("code", saisie.entite).maybeSingle();
  if (!entite) return { ok: false, message: MESSAGES_CREATION.poste, champ: "entite" };

  const { data: occupant, error: erreurLecture } = await session
    .from("utilisateurs")
    .select("id")
    .eq("entite_id", entite.id)
    .eq("role", role)
    .eq("actif", true)
    .maybeSingle();
  if (erreurLecture) return { ok: false, message: MESSAGES_CREATION.refus };
  if (occupant) return { ok: false, message: MESSAGES_CREATION.posteOccupe, champ: "role" };

  const { data: homonyme } = await session.from("utilisateurs").select("id").eq("nom_utilisateur", nomUtilisateur).maybeSingle();
  if (homonyme) return { ok: false, message: MESSAGES_CREATION.nomPris, champ: "nomUtilisateur" };

  // 2 et 3. Compte de connexion avec mot de passe provisoire
  const motDePasse = genererMotDePasseProvisoire();
  const creerConnexion = () =>
    service.auth.admin.createUser({ email: adresseInterne(nomUtilisateur), password: motDePasse, email_confirm: true });
  let { data: cree, error: erreurAuth } = await creerConnexion();
  if (erreurAuth?.code === "email_exists" && (await libererNomArchive(session, service, nomUtilisateur))) {
    ({ data: cree, error: erreurAuth } = await creerConnexion());
  }
  if (erreurAuth || !cree.user) {
    if (erreurAuth?.code === "email_exists" || erreurAuth?.code === "user_already_exists") {
      return { ok: false, message: MESSAGES_CREATION.nomPris, champ: "nomUtilisateur" };
    }
    return { ok: false, message: MESSAGES_CREATION.inattendu };
  }

  // 4. Profil, au nom de l'administrateur (droits vérifiés et journal d'audit par la base)
  const { error: erreurProfil } = await session.from("utilisateurs").insert({
    id: cree.user.id,
    nom_utilisateur: nomUtilisateur,
    nom_complet: nomComplet,
    role,
    entite_id: entite.id,
    actif: true,
    doit_changer_mot_de_passe: true,
    double_verification: false,
  });

  if (erreurProfil) {
    // 5. Rien ne doit rester à moitié fait
    await service.auth.admin.deleteUser(cree.user.id);
    if (erreurProfil.code === "23505") {
      // Doublon : un autre poste actif a été créé entre-temps, ou nom déjà pris
      const message = erreurProfil.message.includes("nom_utilisateur") ? MESSAGES_CREATION.nomPris : MESSAGES_CREATION.posteOccupe;
      return { ok: false, message };
    }
    if (erreurProfil.code === "42501") return { ok: false, message: MESSAGES_CREATION.refus };
    return { ok: false, message: MESSAGES_CREATION.inattendu };
  }

  return { ok: true, nomUtilisateur, nomComplet, motDePasse, entite: entite.nom, role };
}

/**
 * Le nom est encore porté par le compte de connexion d'un ancien agent désactivé :
 * ce compte reçoit son nom d'archive. Renvoie vrai si le nom a été libéré.
 */
async function libererNomArchive(session: SupabaseClient, service: SupabaseClient, nom: string): Promise<boolean> {
  const { data: anciens } = await session
    .from("utilisateurs")
    .select("id, nom_utilisateur")
    .eq("ancien_nom_utilisateur", nom)
    .eq("actif", false);
  let libere = false;
  for (const ancien of anciens ?? []) {
    const { data } = await service.auth.admin.getUserById(ancien.id);
    if (data.user?.email !== adresseInterne(nom)) continue;
    const { error } = await service.auth.admin.updateUserById(ancien.id, { email: adresseInterne(ancien.nom_utilisateur) });
    if (!error) libere = true;
  }
  return libere;
}
