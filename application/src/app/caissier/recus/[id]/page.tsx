import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { adressePublique } from "@/lib/origine";
import { adresseVerification, lireRecu } from "@/lib/recus";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { ImpressionRecu } from "./impression-recu";

export const metadata: Metadata = { title: "Reçu de paiement" };

/** Reçu de paiement A5 (fichier 39), d'après la maquette « Caissier — Reçu ». */
export default function Page({ params, searchParams }: PageProps<"/caissier/recus/[id]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Recu params={params} parametres={searchParams} />
    </Suspense>
  );
}

async function Recu({
  params,
  parametres,
}: {
  params: PageProps<"/caissier/recus/[id]">["params"];
  parametres: PageProps<"/caissier/recus/[id]">["searchParams"];
}) {
  const agent = await exigerEspace("caissier");
  const { id } = await params;
  const recu = await lireRecu(await creerClientServeur(), String(id));
  if (!recu) notFound();
  const imprimer = (await parametres).imprimer === "1";
  const qrSvg = await QRCode.toString(adresseVerification(await adressePublique(), recu.jeton), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });

  return (
    <CadreEspace
      agent={agent}
      actif="/caissier"
      enTete={
        <Link href="/caissier" className="font-semibold">
          ‹ Retour à la file d&apos;attente
        </Link>
      }
    >
      <ImpressionRecu key={recu.id} recu={recu} qrSvg={qrSvg} imprimerTout={imprimer && recu.statut === "valide"} />
    </CadreEspace>
  );
}
