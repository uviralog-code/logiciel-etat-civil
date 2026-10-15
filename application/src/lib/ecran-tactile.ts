"use client";

import { useSyncExternalStore } from "react";

/** Téléphone ou tablette (écran tactile) : l'appareil photo est à portée de main. */
export function useEcranTactile(): boolean {
  return useSyncExternalStore(
    (changer) => {
      const m = window.matchMedia("(pointer: coarse)");
      m.addEventListener("change", changer);
      return () => m.removeEventListener("change", changer);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}
