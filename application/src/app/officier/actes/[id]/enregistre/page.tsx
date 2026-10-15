import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { CodeActe } from "@/components/code-acte";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { exigerEspace } from "@/lib/acces";
import { lireActe } from "@/lib/actes";
import { STATUTS } from "@/lib/charte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { formaterMontant } from "@/lib/tarifs";
import { BoutonTransmettre } from "./bouton-transmettre";

export const metadata: Metadata = { title: "Acte enregistré" };

/** Étape 3 de la saisie (fichier 29) : l'acte est enregistré, avec l'ID donné par la base. */
export default function Page({ params, searchParams }: PageProps<"/officier/actes/[id]/enregistre">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Confirmation params={params} parametres={searchParams} />
    </Suspense>
  );
}

async function Confirmation({
  params,
  parametres,
}: {
  params: PageProps<"/officier/actes/[id]/enregistre">["params"];
  parametres: PageProps<"/officier/actes/[id]/enregistre">["searchParams"];
}) {
  const agent = await exigerEspace("officier");
  const { id } = await params;
  // Après une correction (fichier 30), les textes le disent
  const corrige = (await parametres).corrige === "1";
  const verbe = corrige ? "corrigé" : "enregistré";
  // La base ne montre que les actes de l'entité de l'officier
  const acte = await lireActe(await creerClientServeur(), String(id));
  if (!acte) notFound();
  const transmis = acte.statut === "en_attente_paiement";
  const statut = STATUTS[acte.statut];

  return (
    <CadreEspace agent={agent} actif="/officier/actes/nouveau" enTete={<EtapesSaisie courante={transmis ? 4 : 3} />}>
      <section
        aria-labelledby="titre-confirmation"
        className={`flex max-w-3xl flex-col gap-4 rounded-[10px] border p-6 ${transmis ? "border-[#a5d6a7] bg-succes-fond" : "border-[#c5d4ee] bg-[#f0f5ff]"}`}
      >
        <h1 id="titre-confirmation" className="font-serif text-[30px] font-bold">
          {transmis
            ? `Acte ${verbe} et transmis au Caissier`
            : acte.statut === "enregistre"
              ? `Acte ${verbe}`
              : `Acte ${statut.libelle.toLowerCase()}`}
        </h1>
        <p className="flex flex-col gap-1">
          <span className="text-[15px] text-texte-doux">ID de l&apos;acte</span>
          <span className="font-mono text-[28px] font-semibold tracking-[0.02em]" data-testid="identifiant">
            {acte.identifiant}
          </span>
        </p>
        <p className="text-[17px]">
          {transmis
            ? "Le demandeur peut se présenter à la caisse : le Caissier retrouvera l'acte dans sa file d'attente."
            : acte.statut === "enregistre"
              ? "L'acte n'est pas encore transmis : le Caissier ne le voit pas. Transmettez-le quand le dossier est complet."
              : null}
        </p>
        {acte.statut === "enregistre" && <BoutonTransmettre id={acte.id} />}
      </section>

      <section aria-label="Résumé de l'acte" className="flex max-w-3xl flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-6">
        <p className="flex flex-wrap items-center gap-3">
          <CodeActe acte={acte.type} />
          <strong className="text-lg">{acte.type.libelle}</strong>
          <span className="rounded-full px-2.5 py-[3px] text-sm font-bold" style={{ background: statut.fond, color: statut.texte }}>
            {statut.libelle}
          </span>
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          <dt className="text-texte-doux">Titulaire</dt>
          <dd className="font-semibold">
            {acte.titulaire_nom}
            {acte.titulaire_2_nom && ` et ${acte.titulaire_2_nom}`}
          </dd>
          {acte.demandeur_nom && (
            <>
              <dt className="text-texte-doux">Demandeur</dt>
              <dd>
                {acte.demandeur_nom}
                {acte.demandeur_telephone && ` · ${acte.demandeur_telephone}`}
              </dd>
            </>
          )}
          <dt className="text-texte-doux">Catégorie</dt>
          <dd>{acte.categorie === "etranger" ? "Étranger" : "National"}</dd>
          <dt className="text-texte-doux">Montant</dt>
          <dd className="font-semibold">{acte.montant_du != null && acte.devise_du ? formaterMontant(acte.montant_du, acte.devise_du) : "—"}</dd>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-5">
        <Link
          href="/officier/actes/nouveau"
          className="inline-flex h-[52px] items-center rounded-lg border border-bleu-etat bg-surface px-5 text-[17px] font-bold text-bleu-etat hover:bg-bleu-clair"
        >
          Établir un autre acte
        </Link>
        <Link href={`/officier/actes/${acte.id}`}>Voir la fiche de l&apos;acte</Link>
        <Link href="/officier">Retour à l&apos;accueil</Link>
      </div>
    </CadreEspace>
  );
}
