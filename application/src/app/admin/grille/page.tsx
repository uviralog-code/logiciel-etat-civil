import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { changementsProgrammes, lireEntites, resumeGrille } from "@/lib/grille-commune";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira, formaterDate, lireDonneesTarifaires } from "@/lib/tarifs";
import { ChangementsProgrammes } from "./changements-programmes";
import { FormulaireTarif } from "./formulaire-tarif";
import { TableauGrille } from "./tableau-grille";

export const metadata: Metadata = { title: "Grille commune" };

/** Grille tarifaire commune (fichier 24), d'après la maquette « Admin — Grille commune ». */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Grille />
    </Suspense>
  );
}

async function Grille() {
  const agent = await exigerEspace("admin");
  const supabase = await creerClientServeur();
  // L'administrateur vérifié voit la grille commune et les ajustements des 4 entités (fichiers 08 et 15)
  const [donnees, entites] = await Promise.all([lireDonneesTarifaires(supabase), lireEntites(supabase)]);
  const aujourdhui = aujourdhuiUvira();
  const resume = resumeGrille(donnees, aujourdhui);

  return (
    <CadreEspace agent={agent} actif="/admin/grille">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Grille tarifaire commune</h1>
        <p className="text-[17px] text-texte-doux">
          Elle s&apos;applique aux 4 entités, sauf là où une entité a ajusté un tarif chez elle (écarts signalés en jaune).
        </p>
        <p className="text-texte-doux" data-testid="resume-grille">
          {resume.depuis ? `Grille en vigueur depuis le ${formaterDate(resume.depuis)}` : "Aucun tarif en vigueur"}
          {` · ${resume.actes} actes · ${resume.tarifs} tarifs`}
          {resume.programmes > 0 && ` · ${resume.programmes} changement${resume.programmes > 1 ? "s" : ""} programmé${resume.programmes > 1 ? "s" : ""}`}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-7">
        <TableauGrille donnees={donnees} entites={entites} aujourdhui={aujourdhui} />
        <FormulaireTarif donnees={donnees} entites={entites} aujourdhui={aujourdhui} />
      </div>
      <ChangementsProgrammes changements={changementsProgrammes(donnees, aujourdhui)} />
    </CadreEspace>
  );
}
