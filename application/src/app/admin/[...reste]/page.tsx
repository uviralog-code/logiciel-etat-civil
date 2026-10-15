import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";

/**
 * Toute autre adresse de l'espace « admin » : la garde s'applique d'abord
 * (un autre rôle est renvoyé vers son espace), puis « page introuvable ».
 * Les écrans construits plus tard ont leur propre page, qui prend le dessus.
 */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Garde />
    </Suspense>
  );
}

async function Garde(): Promise<never> {
  await exigerEspace("admin");
  notFound();
}
