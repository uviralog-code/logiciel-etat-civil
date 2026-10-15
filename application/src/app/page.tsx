import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChargementEspace } from "@/components/cadre-espace";
import { pageDAccueil } from "@/lib/aiguillage";
import { lireAgentConnecte } from "@/lib/session";

/**
 * Adresse principale du logiciel : chacun est envoyé au bon endroit
 * (connexion, mot de passe à remplacer, code de vérification ou son espace).
 */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Aiguillage />
    </Suspense>
  );
}

async function Aiguillage(): Promise<never> {
  const agent = await lireAgentConnecte();
  redirect(pageDAccueil(agent));
}
