"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import { Icone } from "./icone";

/**
 * Bouton « Se déconnecter » : ferme la session de CE poste (les autres
 * sessions éventuelles de l'agent restent ouvertes) et revient à la connexion.
 */
export function BoutonDeconnexion({ variante = "lien" }: { variante?: "lien" | "menu" }) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const seDeconnecter = () =>
    demarrer(async () => {
      setErreur(null);
      const { error } = await creerClientNavigateur().auth.signOut({ scope: "local" });
      if (error) {
        setErreur("La déconnexion a échoué. Vérifiez la connexion à internet, puis réessayez.");
        return;
      }
      routeur.replace("/connexion");
    });

  const libelle = enCours ? "Déconnexion…" : "Se déconnecter";

  return (
    <>
      {variante === "menu" ? (
        <button
          type="button"
          onClick={seDeconnecter}
          disabled={enCours}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-medium text-[#d6e2f7] hover:bg-white/10 hover:text-white disabled:cursor-wait"
        >
          <Icone nom="sortie" />
          {libelle}
        </button>
      ) : (
        <button
          type="button"
          onClick={seDeconnecter}
          disabled={enCours}
          className="font-semibold text-bleu-etat underline underline-offset-2 hover:text-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
        >
          {libelle}
        </button>
      )}
      {erreur && (
        <span
          role="alert"
          className={`block text-sm font-semibold ${variante === "menu" ? "px-4 text-[#ffd2d2]" : "text-erreur-texte"}`}
        >
          {erreur}
        </span>
      )}
    </>
  );
}
