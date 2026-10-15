/**
 * NOMS D'UTILISATEUR ET ADRESSES INTERNES
 *
 * Les agents se connectent avec un nom d'utilisateur (« mulongwe.officier »).
 * Supabase exige techniquement une adresse e-mail : on en fabrique une,
 * interne et invisible pour l'agent (« mulongwe.officier@agents.etatcivil-uvira.local »).
 */

/** Domaine des adresses internes (modifiable par la variable d'environnement). */
export const DOMAINE_COMPTES =
  process.env.NEXT_PUBLIC_DOMAINE_COMPTES ?? "agents.etatcivil-uvira.local";

/** Même règle que la base (fichier 02) : minuscules, chiffres et points, 3 à 50 caractères. */
const FORMAT_NOM = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

/** Met une saisie au propre : espaces retirés, minuscules. */
export function normaliserNomUtilisateur(saisie: string): string {
  return saisie.trim().toLowerCase();
}

/** Vrai si le nom respecte le format exigé par la base. */
export function estNomUtilisateurValide(nom: string): boolean {
  return nom.length >= 3 && nom.length <= 50 && FORMAT_NOM.test(nom);
}

/** Adresse interne correspondant à un nom d'utilisateur. */
export function adresseInterne(saisie: string): string {
  const nom = normaliserNomUtilisateur(saisie);
  if (!estNomUtilisateurValide(nom)) {
    throw new Error(
      "Nom d'utilisateur invalide : lettres minuscules, chiffres et points uniquement (ex. mulongwe.officier).",
    );
  }
  return `${nom}@${DOMAINE_COMPTES}`;
}

/** Nom d'utilisateur retrouvé à partir d'une adresse interne (ou vide si l'adresse est étrangère). */
export function nomDepuisAdresse(adresse: string): string | null {
  const suffixe = `@${DOMAINE_COMPTES}`;
  if (!adresse.toLowerCase().endsWith(suffixe)) return null;
  const nom = adresse.slice(0, -suffixe.length).toLowerCase();
  return estNomUtilisateurValide(nom) ? nom : null;
}
