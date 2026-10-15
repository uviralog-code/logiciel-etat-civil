"use client";

import { useEffect, useState } from "react";

/** Nom de l'événement émis par l'écran d'import quand le nombre d'actes du lot change. */
export const EVENEMENT_COMPTEUR = "etat-civil:lot-nb-actes";

export function annoncerNombreActes(lotId: string, nombre: number) {
  window.dispatchEvent(new CustomEvent(EVENEMENT_COMPTEUR, { detail: { lotId, nombre } }));
}

/** « 37 actes numérisés dans ce lot » (bandeau de la maquette), tenu à jour pendant la saisie. */
export function CompteurLot({ lotId, initial }: { lotId: string; initial: number }) {
  const [nombre, setNombre] = useState(initial);
  useEffect(() => {
    const ecouter = (e: Event) => {
      const d = (e as CustomEvent<{ lotId: string; nombre: number }>).detail;
      if (d.lotId === lotId) setNombre(d.nombre);
    };
    window.addEventListener(EVENEMENT_COMPTEUR, ecouter);
    return () => window.removeEventListener(EVENEMENT_COMPTEUR, ecouter);
  }, [lotId]);
  return (
    <div className="flex flex-col items-end">
      <span className="text-[38px] leading-none font-bold" data-testid="nb-actes-lot">
        {nombre}
      </span>
      <span>
        acte{nombre > 1 ? "s" : ""} numérisé{nombre > 1 ? "s" : ""} dans ce lot
      </span>
    </div>
  );
}
