import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LisereDrapeau } from "@/components/lisere-drapeau";
import { espaceDuRole } from "@/lib/connexion";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { FormulaireVerification } from "./formulaire-verification";

export const metadata: Metadata = { title: "Code de vérification" };

/**
 * Code de vérification à 6 chiffres (fichier 18), d'après la maquette validée
 * « Mot de passe et code de vérification ». La première fois, l'écran guide la
 * mise en place du téléphone (QR code).
 */
export default function PageVerification() {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <Suspense fallback={<p className="text-texte-doux">Chargement…</p>}>
          <ContenuVerification />
        </Suspense>
      </main>
    </div>
  );
}

async function ContenuVerification() {
  const agent = await lireAgentConnecte();
  if (!agent || !agent.actif) redirect("/connexion");
  const { profil } = agent;
  if (profil.doitChangerMotDePasse) redirect("/mot-de-passe");
  // Pas de double vérification pour ce compte, ou code déjà validé : direction son espace
  if (!profil.doubleVerification || agent.niveau === "aal2") redirect(espaceDuRole(profil.role));

  // Un téléphone est-il déjà relié ? (« totp » ne liste que les téléphones confirmés)
  const supabase = await creerClientServeur();
  const { data } = await supabase.auth.mfa.listFactors();
  const telephoneRelie = (data?.totp.length ?? 0) > 0;

  return (
    <FormulaireVerification
      mode={telephoneRelie ? "verification" : "mise-en-place"}
      nomUtilisateur={profil.nomUtilisateur}
      administrateur={profil.role === "admin"}
      destination={espaceDuRole(profil.role)}
    />
  );
}
