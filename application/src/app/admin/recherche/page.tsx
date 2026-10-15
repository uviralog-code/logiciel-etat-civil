import type { Metadata } from "next";
import { Suspense } from "react";
import { ChargementEspace } from "@/components/cadre-espace";
import { EcranRecherche } from "@/components/ecrans-recherche";

export const metadata: Metadata = { title: "Rechercher un acte" };

/** Rechercher un acte (fichier 32). */
export default function Page({ searchParams }: PageProps<"/admin/recherche">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <EcranRecherche role="admin" parametres={searchParams} />
    </Suspense>
  );
}
