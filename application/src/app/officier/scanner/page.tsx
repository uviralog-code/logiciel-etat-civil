import type { Metadata } from "next";
import { Suspense } from "react";
import { ActesAScanner } from "@/components/actes-a-scanner";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { lireAccueilOfficier } from "@/lib/accueil-officier";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira } from "@/lib/tarifs";

export const metadata: Metadata = { title: "Scanner — Officier" };

/** Écran « Scanner » (fichier 33) : les actes payés ou exonérés qui attendent leur scan. */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Liste />
    </Suspense>
  );
}

async function Liste() {
  const agent = await exigerEspace("officier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité de l'officier introuvable.");
  const { aScanner } = await lireAccueilOfficier(supabase, entite.id, aujourdhuiUvira());

  return (
    <CadreEspace agent={agent} actif="/officier/scanner">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Scanner un acte</h1>
        <p className="text-[17px] text-texte-doux">
          Choisissez l&apos;acte délivré, signé et cacheté, puis joignez son fichier. Pour refaire le scan d&apos;un acte déjà
          archivé, ouvrez sa fiche (par la recherche) et choisissez « Refaire le scan ».
        </p>
      </div>
      <ActesAScanner actes={aScanner} depuis="liste" />
    </CadreEspace>
  );
}
