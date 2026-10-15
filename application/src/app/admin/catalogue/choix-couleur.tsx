"use client";

import { COULEURS_ACTES } from "@/lib/catalogue";

/** Choix de la couleur d'un acte parmi celles de la charte (pastilles). */
export function ChoixCouleur({ valeur, onChange, nom }: { valeur: string; onChange: (c: string) => void; nom: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">Couleur</legend>
      <div className="flex flex-wrap gap-2.5">
        {COULEURS_ACTES.map((c) => (
          <label key={c.valeur} title={c.nom} className="cursor-pointer">
            <input
              type="radio"
              name={nom}
              value={c.valeur}
              checked={valeur.toUpperCase() === c.valeur}
              onChange={() => onChange(c.valeur)}
              className="peer sr-only"
              aria-label={c.nom}
            />
            <span
              aria-hidden="true"
              className="block size-9 rounded-full ring-offset-2 peer-checked:ring-[3px] peer-checked:ring-encre peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-bleu-etat"
              style={{ background: c.valeur }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
