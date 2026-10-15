"use client";

import { useState, useTransition } from "react";
import { transmettre } from "../../actions";

/** « Transmettre au Caissier » pour un acte resté « enregistré ». */
export function BoutonTransmettre({ id }: { id: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            const r = await transmettre(id);
            if (r && !r.ok) setErreur(r.message);
          })
        }
        className="h-14 rounded-lg bg-bleu-etat px-6 text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
      >
        {enCours ? "Transmission…" : "Transmettre au Caissier"}
      </button>
      {erreur && (
        <p role="alert" className="font-semibold text-erreur-texte">
          {erreur}
        </p>
      )}
    </div>
  );
}
