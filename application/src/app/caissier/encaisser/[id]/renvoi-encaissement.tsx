"use client";

import { useRouter } from "next/navigation";
import { BoutonRenvoyer } from "../../bouton-renvoyer";

/** « Renvoyer à l'Officier (motif)… » depuis l'écran d'encaissement : retour à l'accueil avec l'annonce. */
export function RenvoiEncaissement({ acte }: { acte: { id: string; identifiant: string; titulaire: string } }) {
  const router = useRouter();
  return (
    <BoutonRenvoyer
      large
      acte={acte}
      // Déjà parti depuis un autre poste : l'écran relu montre ce qu'il est devenu
      surRenvoi={(renvoye) => (renvoye ? router.push(`/caissier?renvoye=${encodeURIComponent(acte.identifiant)}`) : router.refresh())}
    />
  );
}
