import Link from "next/link";

/**
 * Lien de l'en-tête d'une fiche : « ‹ Résultats de la recherche » quand on vient
 * de la recherche (adresse ?retour=…), sinon « ‹ Retour à l'accueil ».
 */
export function LienRetour({ retour, accueil }: { retour: string | null; accueil: string }) {
  return (
    <Link href={retour ?? accueil} className="font-semibold">
      {retour ? "‹ Résultats de la recherche" : "‹ Retour à l'accueil"}
    </Link>
  );
}

/** Le retour n'est accepté que vers la page de recherche de l'espace (jamais vers un autre site). */
export function retourDepuisAdresse(p: Record<string, string | string[] | undefined>, base: string): string | null {
  const brut = Array.isArray(p.retour) ? p.retour[0] : p.retour;
  if (!brut) return null;
  return brut === base || brut.startsWith(`${base}?`) ? brut : null;
}
