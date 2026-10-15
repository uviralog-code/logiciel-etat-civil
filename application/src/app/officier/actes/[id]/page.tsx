import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { FicheActeVue } from "@/components/fiche-acte-vue";
import { LienRetour, retourDepuisAdresse } from "@/components/lien-retour";
import { exigerEspace } from "@/lib/acces";
import { FICHES } from "@/lib/actes";
import { actionsPossibles, lireFicheActe } from "@/lib/fiche-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { BoutonTransmettre } from "./enregistre/bouton-transmettre";
import { ActionsFiche } from "./actions-fiche";

export const metadata: Metadata = { title: "Fiche d'un acte" };

/** Fiche d'un acte (fichier 31), d'après la maquette « Officier — Fiche d'un acte ». */
export default function Page({ params, searchParams }: PageProps<"/officier/actes/[id]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Fiche params={params} parametres={searchParams} />
    </Suspense>
  );
}

async function Fiche({
  params,
  parametres,
}: {
  params: PageProps<"/officier/actes/[id]">["params"];
  parametres: PageProps<"/officier/actes/[id]">["searchParams"];
}) {
  const agent = await exigerEspace("officier");
  const { id } = await params;
  // La base ne montre que les actes de l'entité de l'officier
  const fiche = await lireFicheActe(await creerClientServeur(), String(id));
  if (!fiche) notFound();
  const { acte } = fiche;
  const possibles = actionsPossibles(fiche);
  const p = await parametres;
  // Retour de l'écran « Scan de l'acte » après un archivage réussi
  const archive = typeof p.archive === "string" && /^\d{1,3}$/.test(p.archive) && fiche.document?.version === Number(p.archive) ? fiche.document : null;

  return (
    <CadreEspace agent={agent} actif="/officier" enTete={<LienRetour retour={retourDepuisAdresse(p, "/officier/recherche")} accueil="/officier" />}>
      {archive && (
        <p role="status" className="rounded-lg border border-[#a7d3b1] bg-succes-fond px-4 py-3 font-semibold text-succes-texte" data-testid="archive-reussi">
          Scan archivé : version {archive.version}
          {archive.nb_pages ? `, ${archive.nb_pages} page${archive.nb_pages > 1 ? "s" : ""}` : ""}. Il fait foi pour cet acte.
        </p>
      )}
      <FicheActeVue
        fiche={fiche}
        espace="/officier"
        avecScan
        actions={
          <>
            <ActionsFiche
              acte={{
                id: acte.id,
                identifiant: acte.identifiant,
                titulaire: acte.titulaire_nom,
                titulaire2: acte.titulaire_2_nom,
                demandeur: acte.demandeur_nom,
                deuxEpoux: Boolean(FICHES[acte.type.modele_fiche].libelleTitulaire2),
                libelleTitulaire: acte.type.modele_fiche === "mariage" ? "Époux" : "Titulaire",
              }}
              possibles={possibles}
            />
            {possibles.transmettre && <BoutonTransmettre id={acte.id} />}
          </>
        }
      />
    </CadreEspace>
  );
}
