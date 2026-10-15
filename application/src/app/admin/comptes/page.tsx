import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { lireComptes } from "@/lib/comptes";
import type { Poste } from "@/lib/creation-compte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { FormulaireCreation } from "./formulaire-creation";
import { TableauComptes } from "./tableau-comptes";

export const metadata: Metadata = { title: "Comptes des agents" };

/**
 * Comptes des agents (fichier 20), d'après la maquette « Admin — Comptes ».
 * Création d'un compte : fichier 21. Réinitialisation et désactivation : fichier 22.
 */
export default function Page({ searchParams }: PageProps<"/admin/comptes">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Comptes parametres={searchParams} />
    </Suspense>
  );
}

async function Comptes({ parametres }: { parametres: PageProps<"/admin/comptes">["searchParams"] }) {
  const agent = await exigerEspace("admin");
  // « Créer » sur une ligne « À créer » : le formulaire s'ouvre sur ce poste (ex. ?creer=BAV-caissier)
  const { creer } = await parametres;
  const selection = typeof creer === "string" ? creer : null;
  // La base ne livre la liste complète qu'à l'administrateur vérifié (fichiers 08 et 15)
  const liste = await lireComptes(await creerClientServeur());
  const postes: Poste[] = liste.rangees.flatMap((r) => (r.type === "a-creer" ? [{ entite: r.entite, role: r.role }] : []));

  return (
    <CadreEspace agent={agent} actif="/admin/comptes">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Comptes des agents</h1>
        <p className="text-texte-doux">1 administrateur · 1 officier et 1 caissier actifs par entité</p>
      </div>
      <TableauComptes liste={liste} />
      {/* Sous le tableau (le tableau a besoin de toute la largeur avec ses boutons) */}
      <FormulaireCreation postes={postes} selection={selection} />
      <p className="max-w-3xl text-sm leading-normal text-texte-doux">
        « Hors-ligne : reste N jours » : l&apos;agent ne s&apos;est pas connecté avec internet depuis plusieurs jours. Au
        bout de 7 jours, le travail sans internet est bloqué sur son poste jusqu&apos;à sa prochaine connexion en ligne.
      </p>
    </CadreEspace>
  );
}
