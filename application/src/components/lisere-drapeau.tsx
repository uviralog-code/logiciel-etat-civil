/**
 * Fin liseré aux couleurs du drapeau de la RDC, en haut de chaque écran.
 * Purement décoratif : ignoré par les lecteurs d'écran.
 */
export function LisereDrapeau() {
  return (
    <div className="flex h-1.5" aria-hidden="true" data-testid="lisere-drapeau">
      <div className="flex-[6] bg-drapeau-ciel" />
      <div className="flex-1 bg-drapeau-jaune" />
      <div className="flex-[2] bg-drapeau-rouge" />
      <div className="flex-1 bg-drapeau-jaune" />
      <div className="flex-[6] bg-drapeau-ciel" />
    </div>
  );
}
