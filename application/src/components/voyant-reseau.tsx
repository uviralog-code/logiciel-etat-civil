"use client";

import { useSyncExternalStore } from "react";

function abonner(prevenir: () => void) {
  window.addEventListener("online", prevenir);
  window.addEventListener("offline", prevenir);
  return () => {
    window.removeEventListener("online", prevenir);
    window.removeEventListener("offline", prevenir);
  };
}

/**
 * Vrai si l'ordinateur a accès au réseau. Se met à jour tout seul quand la
 * connexion tombe ou revient. (Côté serveur, on suppose « en ligne ».)
 */
export function useEnLigne() {
  return useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    () => true,
  );
}

/** Bandeau d'état du réseau (écran de connexion, puis en-tête des écrans de travail). */
export function VoyantReseau({ variante = "bandeau" }: { variante?: "bandeau" | "pastille" }) {
  const enLigne = useEnLigne();

  // Petite pastille de l'en-tête des écrans de travail
  if (variante === "pastille") {
    return (
      <span
        role="status"
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
          enLigne ? "bg-succes-fond text-succes-texte" : "bg-attention-fond text-attention-texte"
        }`}
      >
        <span className={`size-[9px] rounded-full ${enLigne ? "bg-[#2e7d32]" : "bg-[#b26a00]"}`} aria-hidden="true" />
        {enLigne ? "En ligne" : "Hors-ligne"}
      </span>
    );
  }

  if (enLigne) {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-lg bg-succes-fond px-3.5 py-2.5 text-[15px] font-semibold text-succes-texte"
      >
        <span className="size-2.5 rounded-full bg-[#2e7d32]" aria-hidden="true" />
        <span>En ligne — connexion à internet disponible</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-lg bg-attention-fond px-3.5 py-2.5 text-[15px] text-attention-texte"
    >
      <span className="font-bold">Hors-ligne — pas de connexion à internet</span>
      <span>Vérifiez le câble, le Wi-Fi ou la clé internet. La connexion reprendra dès le retour du réseau.</span>
    </div>
  );
}
