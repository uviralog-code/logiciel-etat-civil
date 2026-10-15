import type { Metadata } from "next";
import { Suspense } from "react";
import { ChargementEspace } from "@/components/cadre-espace";
import { EcranFicheLecture } from "@/components/ecrans-recherche";

export const metadata: Metadata = { title: "Fiche d'un acte" };

/** Fiche d'un acte, en lecture seule (fichier 32). */
export default function Page({ params, searchParams }: PageProps<"/caissier/actes/[id]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <EcranFicheLecture role="caissier" params={params} parametres={searchParams} />
    </Suspense>
  );
}
