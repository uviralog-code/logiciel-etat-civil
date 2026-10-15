"use client";

import { useRef, useState, type KeyboardEvent, type Ref } from "react";

const NOMBRE = 6;

/**
 * Saisie du code à 6 chiffres, une case par chiffre (maquette « Code de vérification »).
 * - le curseur avance tout seul ; « Retour arrière » revient à la case précédente ;
 * - un code collé ou proposé par le téléphone remplit toutes les cases d'un coup ;
 * - la valeur complète est envoyée dans un champ caché nommé `name`.
 * Pour vider les cases (après une erreur), le parent change la clé (`key`) du composant.
 */
export function SaisieCode({
  name,
  invalide = false,
  decritPar,
  ref,
}: {
  name: string;
  invalide?: boolean;
  decritPar?: string;
  /** Première case (pour y placer le curseur). */
  ref?: Ref<HTMLInputElement>;
}) {
  const [chiffres, setChiffres] = useState<string[]>(Array(NOMBRE).fill(""));
  const cases = useRef<(HTMLInputElement | null)[]>([]);

  const aller = (i: number) => cases.current[Math.max(0, Math.min(NOMBRE - 1, i))]?.focus();

  const saisir = (i: number, valeur: string) => {
    const nouveaux = valeur.replace(/\D/g, "");
    const suite = [...chiffres];
    if (nouveaux.length === 0) {
      suite[i] = "";
      setChiffres(suite);
      return;
    }
    // Un seul chiffre tapé, ou plusieurs collés : on remplit à partir de cette case
    const aPlacer = nouveaux.length > 1 && nouveaux.length >= NOMBRE ? nouveaux.slice(0, NOMBRE) : nouveaux;
    const depart = aPlacer.length === NOMBRE ? 0 : i;
    [...aPlacer].forEach((c, k) => {
      if (depart + k < NOMBRE) suite[depart + k] = c;
    });
    setChiffres(suite);
    aller(Math.min(depart + aPlacer.length, NOMBRE - 1));
  };

  const touche = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chiffres[i] && i > 0) {
      e.preventDefault();
      const suite = [...chiffres];
      suite[i - 1] = "";
      setChiffres(suite);
      aller(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      aller(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      aller(i + 1);
    }
  };

  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" aria-describedby={decritPar}>
      <legend className="mb-2.5 p-0 font-semibold">Code à 6 chiffres</legend>
      <div className="grid grid-cols-6 gap-2.5">
        {chiffres.map((chiffre, i) => (
          <input
            key={i}
            ref={(element) => {
              cases.current[i] = element;
              if (i === 0) {
                if (typeof ref === "function") ref(element);
                else if (ref) ref.current = element;
              }
            }}
            aria-label={`Chiffre ${i + 1}`}
            value={chiffre}
            onChange={(e) => saisir(i, e.target.value)}
            onKeyDown={(e) => touche(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-invalid={invalide ? true : undefined}
            className="h-[60px] min-w-0 rounded-lg border border-bordure-champ bg-surface text-center font-mono text-[28px] text-encre focus:border-2 focus:border-bleu-etat aria-invalid:border-2 aria-invalid:border-erreur-texte"
          />
        ))}
      </div>
      <input type="hidden" name={name} value={chiffres.join("")} />
    </fieldset>
  );
}
