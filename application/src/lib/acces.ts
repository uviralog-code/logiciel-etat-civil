import "server-only";
import { redirect } from "next/navigation";
import type { RoleUtilisateur } from "./charte";
import { regleAcces } from "./aiguillage";
import { lireAgentConnecte, type AgentConnecte } from "./session";

/**
 * Garde de chaque page d'un espace de travail : renvoie l'agent connecté s'il
 * a le droit d'entrer, sinon l'envoie là où il doit aller (connexion, mot de
 * passe, code de vérification ou son propre espace).
 *
 * À appeler dans la PAGE (pas dans la mise en page commune), pour que la
 * vérification soit refaite à chaque navigation (recommandation Next.js 16).
 */
export async function exigerEspace(role: RoleUtilisateur): Promise<AgentConnecte> {
  const agent = await lireAgentConnecte();
  const decision = regleAcces(agent, role);
  if (!decision.autorise) redirect(decision.redirection);
  return agent!;
}
