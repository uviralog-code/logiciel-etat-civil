import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { lignesCatalogue, lireTypesActes } from "@/lib/catalogue";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira, lireDonneesTarifaires } from "@/lib/tarifs";
import { FormulaireType } from "./formulaire-type";
import { TableauCatalogue } from "./tableau-catalogue";

export const metadata: Metadata = { title: "Catalogue des actes" };

/** Catalogue des actes de l'administrateur (fichier 27). */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Catalogue />
    </Suspense>
  );
}

async function Catalogue() {
  const agent = await exigerEspace("admin");
  const supabase = await creerClientServeur();
  const [actes, { communs }] = await Promise.all([lireTypesActes(supabase), lireDonneesTarifaires(supabase, { inclureInactifs: true })]);
  const aujourdhui = aujourdhuiUvira();
  const retires = actes.filter((a) => !a.actif).length;

  return (
    <CadreEspace agent={agent} actif="/admin/catalogue">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Catalogue des actes</h1>
        <p className="max-w-4xl text-[17px] text-texte-doux">
          Commun aux 4 entités. Un type d&apos;acte ne se supprime jamais : on le retire du catalogue, et on peut l&apos;y
          remettre. Les prix se changent dans « Grille commune ».
        </p>
        <p className="text-texte-doux" data-testid="resume-catalogue">
          {actes.length - retires} actes au catalogue{retires > 0 && ` · ${retires} retiré${retires > 1 ? "s" : ""}`}
        </p>
      </div>
      <TableauCatalogue lignes={lignesCatalogue(actes, communs, aujourdhui)} />
      <FormulaireType actes={actes} aujourdhui={aujourdhui} />
    </CadreEspace>
  );
}
