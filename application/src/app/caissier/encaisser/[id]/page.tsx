import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { FAMILLES, STATUTS } from "@/lib/charte";
import { lireCloture, lireTauxApplicable } from "@/lib/encaissement";
import { lireFicheActe } from "@/lib/fiche-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { aujourdhuiUvira, formaterDate, formaterMontant, formaterTaux } from "@/lib/tarifs";
import { BoutonExonerer } from "./bouton-exonerer";
import { EcranEncaissement } from "./ecran-encaissement";
import { RenvoiEncaissement } from "./renvoi-encaissement";

export const metadata: Metadata = { title: "Encaissement" };

/** Écran « Encaissement » (fichier 38), d'après la maquette « Caissier — Encaissement ». */
export default function Page({ params }: PageProps<"/caissier/encaisser/[id]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Encaissement params={params} />
    </Suspense>
  );
}

const RETOUR = (
  <Link href="/caissier" className="font-semibold">
    ‹ Retour à la file d&apos;attente
  </Link>
);

async function Encaissement({ params }: { params: PageProps<"/caissier/encaisser/[id]">["params"] }) {
  const agent = await exigerEspace("caissier");
  const { id } = await params;
  const supabase = await creerClientServeur();
  // La base ne montre que les actes de l'entité du caissier
  const fiche = await lireFicheActe(supabase, String(id));
  if (!fiche || fiche.acte.origine !== "nouveau") notFound();
  const { acte } = fiche;
  const aujourdhui = aujourdhuiUvira();
  const [taux, clotureLe] = await Promise.all([lireTauxApplicable(supabase, acte.entite_id), lireCloture(supabase, acte.entite_id, aujourdhui)]);
  const titulaire = acte.titulaire_2_nom ? `${acte.titulaire_nom} et ${acte.titulaire_2_nom}` : acte.titulaire_nom;
  const resume = { id: acte.id, identifiant: acte.identifiant, titulaire };
  const couleur = acte.type.couleur ?? FAMILLES[acte.type.famille]?.couleur ?? "#374151";
  const enTete = (
    <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {RETOUR}
      <span>
        Taux du jour : <strong data-testid="taux-entete">{taux == null ? "aucun taux saisi" : formaterTaux(taux)}</strong>
      </span>
    </span>
  );

  const bandeau = (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px] text-white sm:px-10" style={{ background: couleur }} data-testid="bandeau-acte">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[22px] font-bold tracking-[0.02em] uppercase sm:text-[26px]">{acte.type.libelle}</span>
        <span className="text-lg">
          Titulaire : <strong>{titulaire}</strong>
          {acte.demandeur_nom && ` · demandeur : ${acte.demandeur_nom}`}
        </span>
      </div>
      <span className="rounded-lg bg-white px-3.5 py-2 font-mono text-lg font-semibold break-all sm:text-xl" style={{ color: couleur }}>
        {acte.identifiant}
      </span>
    </div>
  );

  // L'acte n'est plus (ou pas encore) chez le Caissier
  if (acte.statut !== "en_attente_paiement" || acte.montant_du == null || !acte.devise_du) {
    const recu = fiche.recu?.statut === "valide" ? fiche.recu : null;
    return (
      <CadreEspace agent={agent} actif="/caissier/encaisser" enTete={RETOUR} bandeau={bandeau}>
        <section className="flex max-w-3xl flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-7" data-testid="plus-en-attente">
          <h1 className="text-2xl font-bold">Cet acte n&apos;est pas en attente de paiement</h1>
          <p className="text-lg">
            Statut actuel : <strong>{STATUTS[acte.statut].libelle}</strong>
            {recu && ` — reçu ${recu.numero_recu} émis à ${heureUvira(recu.encaisse_le)}`}
            {fiche.exoneration && ` — exonéré à ${heureUvira(fiche.exoneration.accorde_le)}`}.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/caissier/actes/${acte.id}`} className="inline-flex h-12 items-center rounded-lg border border-bleu-etat px-5 font-bold text-bleu-etat no-underline hover:bg-bleu-clair">
              Voir la fiche de l&apos;acte
            </Link>
            <Link href="/caissier" className="inline-flex h-12 items-center rounded-lg bg-bleu-etat px-5 font-bold text-white no-underline hover:bg-bleu-etat-fonce">
              Retour à la file d&apos;attente
            </Link>
          </div>
        </section>
      </CadreEspace>
    );
  }

  const bloque = clotureLe ? `La caisse du ${formaterDate(aujourdhui)} est clôturée (à ${heureUvira(clotureLe)}) : l'usager paiera demain.` : null;
  const informations: [string, string][] = [
    ["Catégorie", acte.categorie === "etranger" ? "Étranger" : "National"],
    ["Enregistré par", (acte.cree_par && fiche.noms[acte.cree_par]) || "—"],
    ["Transmis à", acte.transmis_le ? (aujourdhuiUvira(new Date(acte.transmis_le)) === aujourdhui ? heureUvira(acte.transmis_le) : `${formaterDate(aujourdhuiUvira(new Date(acte.transmis_le)))} · ${heureUvira(acte.transmis_le)}`) : "—"],
    ["Tarif", `${(acte as { tarif_source?: string | null }).tarif_source === "entite" ? "Tarif de l'entité" : "Grille commune"} (${acte.date_acte.slice(0, 4)})`],
  ];

  return (
    <CadreEspace agent={agent} actif="/caissier/encaisser" enTete={enTete} bandeau={bandeau}>
      <div className="flex flex-wrap items-start gap-8">
        <EcranEncaissement acte={resume} du={{ montant: acte.montant_du, devise: acte.devise_du }} taux={taux} bloque={bloque} />

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <section aria-labelledby="titre-acte" className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-6">
            <h2 id="titre-acte" className="text-xl font-bold">
              L&apos;acte
            </h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5" data-testid="informations-acte">
              {informations.map(([cle, valeur]) => (
                <div key={cle} className="contents">
                  <dt className="text-texte-doux">{cle}</dt>
                  <dd className="font-semibold">{valeur}</dd>
                </div>
              ))}
            </dl>
            <Link href={`/caissier/actes/${acte.id}`} className="text-[15px] font-semibold">
              Voir la fiche complète
            </Link>
          </section>
          <section aria-labelledby="titre-decisions" className="flex flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-6">
            <h2 id="titre-decisions" className="text-xl font-bold">
              Autres décisions
            </h2>
            <BoutonExonerer acte={resume} montantNonPercu={formaterMontant(acte.montant_du, acte.devise_du)} desactive={bloque != null} />
            <RenvoiEncaissement acte={resume} />
          </section>
        </aside>
      </div>
    </CadreEspace>
  );
}
