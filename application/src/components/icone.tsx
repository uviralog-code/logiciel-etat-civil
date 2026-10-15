import type { NomIcone } from "@/lib/espaces";

/** Tracés des icônes du menu (repris de la maquette « Officier — Accueil », complétés). */
type Nom = NomIcone | "sortie" | "coche" | "televerser" | "telephone" | "pivoter";

const TRACES: Record<Nom, React.ReactNode> = {
  accueil: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  scanner: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M7 7V4h10v3M7 13h10" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  registres: <path d="M4 6h16M4 12h16M4 18h10" />,
  etiquette: (
    <>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  billets: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  recus: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  taux: <path d="M7 7h11l-3-3M17 17H6l3 3" />,
  cadenas: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  graphique: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  tableau: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="5" rx="1" />
      <rect x="13" y="10" width="8" height="11" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
    </>
  ),
  grille: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 4v16" />
    </>
  ),
  personnes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.5 4 2.7 4 6" />
    </>
  ),
  journal: <path d="M5 3h11l3 3v15H5zM9 9h6M9 13h6M9 17h4" />,
  connexions: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l4 4-4 4M14 12H4" />,
  coche: <path d="M5 12l5 5L20 7" />,
  sortie: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />,
  televerser: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  telephone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  pivoter: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
};

export function Icone({ nom, taille = 20 }: { nom: Nom; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {TRACES[nom]}
    </svg>
  );
}
