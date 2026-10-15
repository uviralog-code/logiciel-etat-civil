"use client";

import { useEffect, useRef, useState, type Ref } from "react";

export const classeChamp =
  "h-12 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";

/**
 * Champ de mot de passe avec bouton « Afficher / Masquer ».
 * Le mot de passe redevient masqué dès que le formulaire est envoyé.
 */
export function ChampMotDePasse({
  id,
  name = id,
  autoComplete,
  invalide = false,
  decritPar,
  ref,
  onChange,
  quoi = "le mot de passe",
}: {
  id: string;
  name?: string;
  autoComplete: "current-password" | "new-password";
  invalide?: boolean;
  decritPar?: string;
  ref?: Ref<HTMLInputElement>;
  onChange?: (valeur: string) => void;
  /** Ce que le bouton montre, pour les lecteurs d'écran (« le mot de passe », « la confirmation »…). */
  quoi?: string;
}) {
  const [visible, setVisible] = useState(false);
  const champ = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const formulaire = champ.current?.form;
    if (!formulaire) return;
    const masquer = () => setVisible(false);
    formulaire.addEventListener("submit", masquer);
    return () => formulaire.removeEventListener("submit", masquer);
  }, []);

  return (
    <div className="relative">
      <input
        ref={(element) => {
          champ.current = element;
          if (typeof ref === "function") ref(element);
          else if (ref) ref.current = element;
        }}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        aria-invalid={invalide ? true : undefined}
        aria-describedby={decritPar}
        className={`${classeChamp} w-full pr-28`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={`${visible ? "Masquer" : "Afficher"} ${quoi}`}
        className="absolute inset-y-1 right-1 flex items-center gap-1.5 rounded-md px-3 font-semibold text-bleu-etat hover:bg-bleu-clair"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M3 3l18 18" />}
        </svg>
        {visible ? "Masquer" : "Afficher"}
      </button>
    </div>
  );
}
