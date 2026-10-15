import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { TableauTarifsEntite } from "@/components/tableau-tarifs-entite";
import { exigerEspace } from "@/lib/acces";
import { nomCourt } from "@/lib/comptes";
import { resumeGrille } from "@/lib/grille-commune";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { ajustementsProgrammes, lignesTarifsEntite, lireEntite, titreTarifs } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterDate, lireDonneesTarifaires } from "@/lib/tarifs";
import { AjustementsProgrammes } from "./ajustements-programmes";
import { FormulaireAjustement } from "./formulaire-ajustement";

export const metadata: Metadata = { title: "Tarifs de l'entité" };

/** Tarifs de l'entité (fichier 25), d'après la maquette « Officier — Tarifs de l'entité ». */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Tarifs />
    </Suspense>
  );
}

async function Tarifs() {
  const agent = await exigerEspace("officier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité de l'officier introuvable.");
  const donnees = await lireDonneesTarifaires(supabase, { entiteId: entite.id });
  const aujourdhui = aujourdhuiUvira();
  const { depuis } = resumeGrille(donnees, aujourdhui);

  return (
    <CadreEspace agent={agent} actif="/officier/tarifs">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">{titreTarifs(entite.nom)}</h1>
        <p className="text-[17px] text-texte-doux">
          Par défaut, la grille commune s&apos;applique. Un ajustement ne vaut que pour {nomCourt(entite.nom)} et
          l&apos;administrateur le voit.
        </p>
        {depuis && <p className="text-texte-doux">Grille commune en vigueur depuis le {formaterDate(depuis)}</p>}
      </div>
      <div className="flex flex-wrap items-start gap-8">
        <TableauTarifsEntite lignes={lignesTarifsEntite(donnees, entite.id, aujourdhui)} nomEntite={entite.nom} />
        <FormulaireAjustement donnees={donnees} entite={entite} aujourdhui={aujourdhui} />
      </div>
      <AjustementsProgrammes ajustements={ajustementsProgrammes(donnees, entite.id, aujourdhui)} />
    </CadreEspace>
  );
}
