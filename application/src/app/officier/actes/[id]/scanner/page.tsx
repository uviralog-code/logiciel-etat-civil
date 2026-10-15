import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { FAMILLES } from "@/lib/charte";
import { actionsPossibles, lireFicheActe } from "@/lib/fiche-acte";
import { cheminPrevu } from "@/lib/scans";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { ScanActe } from "./scan-acte";

export const metadata: Metadata = { title: "Scan d'un acte" };

/** D'où vient l'officier : le lien « ‹ Retour » et « Annuler » l'y ramènent. */
const RETOURS = {
  accueil: { lien: "/officier", texte: "‹ Retour à l'accueil" },
  liste: { lien: "/officier/scanner", texte: "‹ Actes à scanner" },
} as const;

/** Scan d'un acte (fichier 33), d'après la maquette « Officier — Scan ». */
export default function Page({ params, searchParams }: PageProps<"/officier/actes/[id]/scanner">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Scan params={params} parametres={searchParams} />
    </Suspense>
  );
}

async function Scan({
  params,
  parametres,
}: {
  params: PageProps<"/officier/actes/[id]/scanner">["params"];
  parametres: PageProps<"/officier/actes/[id]/scanner">["searchParams"];
}) {
  const agent = await exigerEspace("officier");
  const { id } = await params;
  const supabase = await creerClientServeur();
  const fiche = await lireFicheActe(supabase, String(id));
  if (!fiche) notFound();
  const { acte } = fiche;
  const depuis = (await parametres).depuis;
  const retour = depuis === "accueil" || depuis === "liste" ? RETOURS[depuis] : { lien: `/officier/actes/${acte.id}`, texte: "‹ Retour à la fiche de l'acte" };
  const possibles = actionsPossibles(fiche);
  const couleur = acte.type.couleur ?? FAMILLES[acte.type.famille].couleur;
  const paiement = fiche.recu?.statut === "valide" ? `payé à ${heureUvira(fiche.recu.encaisse_le)}` : fiche.exoneration ? "exonéré" : null;
  const titulaire = acte.titulaire_2_nom ? `${acte.titulaire_nom} et ${acte.titulaire_2_nom}` : acte.titulaire_nom;

  const bandeau = (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px] text-white sm:px-10" style={{ background: couleur }} data-testid="bandeau-type">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[26px] leading-tight font-bold tracking-[0.02em] uppercase">{acte.type.libelle}</span>
        <span className="text-lg">
          Titulaire : <strong>{titulaire}</strong>
          {paiement && ` · ${paiement}`}
          {acte.statut === "delivre" && " · délivré"}
        </span>
      </div>
      <span className="rounded-lg bg-white px-3.5 py-2 font-mono text-lg font-semibold break-all" style={{ color: couleur }}>
        {acte.identifiant}
      </span>
    </div>
  );

  return (
    <CadreEspace
      agent={agent}
      actif="/officier/scanner"
      enTete={
        <Link href={retour.lien} className="font-semibold">
          {retour.texte}
        </Link>
      }
      bandeau={bandeau}
    >
      {possibles.scanner || possibles.refaireScan ? (
        <ScanActe
          key={crypto.randomUUID()}
          acte={{
            id: acte.id,
            identifiant: acte.identifiant,
            typeLibelle: acte.type.libelle,
            titulaire,
            chemin: await cheminPrevu(supabase, acte.id),
            version: fiche.scans.length + 1,
            retour: retour.lien,
          }}
        />
      ) : (
        <div className="flex max-w-2xl flex-col gap-3">
          <p role="alert" className="rounded-lg bg-attention-fond px-4 py-3 font-semibold text-attention-texte">
            {acte.statut === "annule"
              ? "Cet acte est annulé : on ne peut plus y joindre de scan."
              : "Cet acte n'est pas encore payé ni exonéré : on scanne l'acte délivré, signé et cacheté, après son paiement."}
          </p>
          <Link href={`/officier/actes/${acte.id}`}>Voir la fiche de l&apos;acte</Link>
        </div>
      )}
    </CadreEspace>
  );
}
