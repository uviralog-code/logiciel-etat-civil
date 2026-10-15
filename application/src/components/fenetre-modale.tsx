"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Fenêtre de confirmation au-dessus de l'écran.
 * - « Échap » ou un clic à côté la ferment (sauf si `bloquee`) ;
 * - le curseur va dans la fenêtre à l'ouverture et revient au bouton d'origine à la fermeture ;
 * - « Tab » reste dans la fenêtre tant qu'elle est ouverte.
 */
export function FenetreModale({
  titre,
  children,
  onFermer,
  bloquee = false,
}: {
  titre: string;
  children: ReactNode;
  onFermer: () => void;
  /** Vrai pendant une opération, ou quand une information ne doit pas être perdue par erreur. */
  bloquee?: boolean;
}) {
  const idTitre = useId();
  const panneau = useRef<HTMLDivElement>(null);
  const fermer = useRef(onFermer);
  const bloque = useRef(bloquee);
  useEffect(() => {
    fermer.current = onFermer;
    bloque.current = bloquee;
  });

  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    const cibles = () =>
      [...(panneau.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea") ?? [])].filter(
        (e) => !e.hasAttribute("disabled"),
      );
    cibles()[0]?.focus();

    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !bloque.current) fermer.current();
      if (e.key === "Tab") {
        const liste = cibles();
        if (liste.length === 0) return;
        const [premier, dernier] = [liste[0], liste[liste.length - 1]];
        if (e.shiftKey && document.activeElement === premier) {
          e.preventDefault();
          dernier.focus();
        } else if (!e.shiftKey && document.activeElement === dernier) {
          e.preventDefault();
          premier.focus();
        }
      }
    };
    document.addEventListener("keydown", touche);
    return () => {
      document.removeEventListener("keydown", touche);
      origine?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#14213d]/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !bloque.current) fermer.current();
      }}
    >
      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        className="flex max-h-full w-full max-w-[520px] flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-6 shadow-xl"
      >
        <h2 id={idTitre} className="text-xl font-bold">
          {titre}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
