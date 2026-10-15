import "server-only";
import { profilDepuisLigne, SELECTION_PROFIL, type LigneProfil, type ProfilAgent } from "./connexion";
import { creerClientServeur } from "./supabase/serveur";

export interface AgentConnecte {
  id: string;
  actif: boolean;
  /** « aal1 » : mot de passe seul ; « aal2 » : mot de passe + code à 6 chiffres. */
  niveau: "aal1" | "aal2";
  profil: ProfilAgent;
}

/**
 * Agent connecté pour la requête en cours, ou vide si personne ne l'est
 * (ou si le compte n'a pas de profil dans le logiciel).
 *
 * L'identité est vérifiée par Supabase (getClaims), jamais simplement lue
 * dans le cookie. Avec Next.js 16, l'appel doit se trouver dans une zone
 * d'affichage différé (<Suspense>).
 */
export async function lireAgentConnecte(): Promise<AgentConnecte | null> {
  const supabase = await creerClientServeur();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;

  const { data: ligne } = await supabase
    .from("utilisateurs")
    .select(SELECTION_PROFIL)
    .eq("id", id)
    .maybeSingle<LigneProfil>();
  if (!ligne) return null;

  const niveau = data.claims.aal === "aal2" ? "aal2" : "aal1";
  return { id, actif: ligne.actif, niveau, profil: profilDepuisLigne(ligne) };
}
