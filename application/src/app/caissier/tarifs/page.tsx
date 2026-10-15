import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { TableauTarifsEntite } from "@/components/tableau-tarifs-entite";
import { exigerEspace } from "@/lib/acces";
import { nomCourt } from "@/lib/comptes";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lignesTarifsEntite, lireEntite, titreTarifs } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, lireDonneesTarifaires } from "@/lib/tarifs";

export const metadata: Metadata = { title: "Tarifs" };

/** Tarifs de l'entité, en lecture seule pour le caissier (fichier 25). */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Tarifs />
    </Suspense>
  );
}

async function Tarifs() {
  const agent = await exigerEspace("caissier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const donnees = await lireDonneesTarifaires(supabase, { entiteId: entite.id });
  const aujourdhui = aujourdhuiUvira();

  return (
    <CadreEspace agent={agent} actif="/caissier/tarifs">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">{titreTarifs(entite.nom)}</h1>
        <p className="text-[17px] text-texte-doux">
          Les prix à demander aux usagers à {nomCourt(entite.nom)}. Seul l&apos;officier d&apos;état civil peut ajuster
          un tarif ; les changements à venir sont signalés en jaune.
        </p>
      </div>
      <TableauTarifsEntite lignes={lignesTarifsEntite(donnees, entite.id, aujourdhui)} nomEntite={entite.nom} />
    </CadreEspace>
  );
}
