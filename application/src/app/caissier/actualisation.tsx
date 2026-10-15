"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { INTERVALLE_ACTUALISATION_MS } from "@/lib/accueil-caissier";

/** Événement émis après un geste du caissier (« MUL-… renvoyé à l'Officier »). */
export const EVENEMENT_ANNONCE = "etat-civil:annonce-caisse";

export function annoncer(texte: string) {
  window.dispatchEvent(new CustomEvent(EVENEMENT_ANNONCE, { detail: texte }));
}

/**
 * Remise à jour automatique de l'accueil (décision du fichier 37) : toutes les
 * 15 secondes tant que l'onglet est visible, et aussitôt au retour sur l'onglet.
 * Seules les données sont relues : une fenêtre ouverte (renvoi) reste ouverte.
 * L'écran garde son état quand on passe à un autre menu (fichier 40) : au retour,
 * il est relu aussitôt, pour ne jamais montrer une file périmée.
 */
export function Actualisation({ luA }: { luA: string }) {
  const router = useRouter();
  const premiereFois = useRef(true);
  useEffect(() => {
    if (premiereFois.current) premiereFois.current = false;
    else router.refresh(); // retour sur cet écran depuis un autre menu
    const relire = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const minuterie = setInterval(relire, INTERVALLE_ACTUALISATION_MS);
    document.addEventListener("visibilitychange", relire);
    return () => {
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", relire);
    };
  }, [router]);

  return (
    <span className="text-[15px] text-texte-doux" data-testid="actualisation">
      Mis à jour à {luA} · automatiquement toutes les 15 s
    </span>
  );
}

/** Messages après un geste ; ils restent affichés quand la ligne de l'acte disparaît de la file. */
export function Annonces({ initial = null }: { initial?: string | null }) {
  const [texte, setTexte] = useState<string | null>(initial);
  useEffect(() => {
    const ecouter = (e: Event) => setTexte((e as CustomEvent<string>).detail);
    window.addEventListener(EVENEMENT_ANNONCE, ecouter);
    return () => window.removeEventListener(EVENEMENT_ANNONCE, ecouter);
  }, []);
  return (
    <p role="status" className={texte ? "rounded-lg bg-succes-fond px-4 py-3 font-semibold text-succes-texte" : "sr-only"}>
      {texte}
    </p>
  );
}

/** Relit l'écran quand on y revient depuis un autre menu (il reste en mémoire entre deux visites). */
export function RelireAuRetour() {
  const router = useRouter();
  const premiereFois = useRef(true);
  useEffect(() => {
    if (premiereFois.current) premiereFois.current = false;
    else router.refresh();
  }, [router]);
  return null;
}
