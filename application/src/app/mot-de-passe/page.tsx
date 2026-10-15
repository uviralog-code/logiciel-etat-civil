import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LisereDrapeau } from "@/components/lisere-drapeau";
import { destinationApresConnexion } from "@/lib/connexion";
import { lireAgentConnecte } from "@/lib/session";
import { FormulaireMotDePasse } from "./formulaire-mot-de-passe";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/**
 * Changement obligatoire du mot de passe provisoire (fichier 17),
 * d'après la maquette validée « Mot de passe et code de vérification ».
 */
export default function PageMotDePasse() {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <Suspense fallback={<p className="text-texte-doux">Chargement…</p>}>
          <ContenuMotDePasse />
        </Suspense>
      </main>
    </div>
  );
}

/** Lit la session : personne connecté → connexion ; obligation déjà levée → page suivante. */
async function ContenuMotDePasse() {
  const agent = await lireAgentConnecte();
  if (!agent || !agent.actif) redirect("/connexion");
  if (!agent.profil.doitChangerMotDePasse) redirect(destinationApresConnexion(agent.profil));

  return (
    <FormulaireMotDePasse
      nomUtilisateur={agent.profil.nomUtilisateur}
      destination={destinationApresConnexion({ ...agent.profil, doitChangerMotDePasse: false })}
    />
  );
}
