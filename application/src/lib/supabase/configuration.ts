/**
 * Adresse du projet Supabase et clés d'accès, lues dans l'environnement.
 * Un message clair est donné si une valeur manque, plutôt qu'une erreur obscure.
 *
 * Les variables NEXT_PUBLIC_* doivent être écrites en toutes lettres pour
 * que Next.js puisse les intégrer à la partie « navigateur » de l'application.
 */
export function configurationSupabase(): { url: string; clePublique: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error(
      "Configuration manquante : NEXT_PUBLIC_SUPABASE_URL (adresse du projet Supabase). Voir le fichier .env.example.",
    );
  }
  if (!clePublique) {
    throw new Error(
      "Configuration manquante : NEXT_PUBLIC_SUPABASE_ANON_KEY (clé publique du projet). Voir le fichier .env.example.",
    );
  }
  return { url, clePublique };
}
