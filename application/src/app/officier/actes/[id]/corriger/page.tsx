import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { lireActe, saisieDepuisActe } from "@/lib/actes";
import { FAMILLES } from "@/lib/charte";
import { heureUvira } from "@/lib/taux";
import { prixSelonCategorie } from "@/lib/nouvel-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lignesTarifsEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterDate, lireDonneesTarifaires, lireTauxEnVigueur } from "@/lib/tarifs";
import { FormulaireActe } from "../../nouveau/[code]/formulaire-acte";

export const metadata: Metadata = { title: "Corriger un acte" };

/** Correction d'un acte « enregistré », par exemple renvoyé par le Caissier (fichier 30). */
export default function Page({ params }: PageProps<"/officier/actes/[id]/corriger">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Correction params={params} />
    </Suspense>
  );
}

async function Correction({ params }: { params: PageProps<"/officier/actes/[id]/corriger">["params"] }) {
  const agent = await exigerEspace("officier");
  const { id } = await params;
  const supabase = await creerClientServeur();
  // La base ne montre que les actes de l'entité de l'officier
  const acte = await lireActe(supabase, String(id));
  if (!acte) notFound();

  const aujourdhui = aujourdhuiUvira();
  const [donnees, taux] = await Promise.all([
    // Prix à la date de l'acte (c'est elle qui fixe le tarif), types retirés compris
    lireDonneesTarifaires(supabase, { entiteId: acte.entite_id, inclureInactifs: true }),
    lireTauxEnVigueur(supabase, acte.entite_id),
  ]);
  const lignes = lignesTarifsEntite({ ...donnees, actes: donnees.actes.map((a) => ({ ...a, actif: true })) }, acte.entite_id, acte.date_acte);
  const prix = { national: prixSelonCategorie(lignes, acte.type_acte_id, "national"), etranger: prixSelonCategorie(lignes, acte.type_acte_id, "etranger") };
  const couleur = acte.type.couleur ?? FAMILLES[acte.type.famille].couleur;

  const bandeau = (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px] text-white sm:px-10" style={{ background: couleur }} data-testid="bandeau-type">
      <div className="flex flex-wrap items-center gap-4">
        <span className="rounded-md bg-white px-2.5 py-1 font-mono text-[15px] font-semibold" style={{ color: couleur }}>
          {acte.type.code}
        </span>
        <span className="text-[26px] font-bold tracking-[0.02em] uppercase">{acte.type.libelle}</span>
      </div>
      <span className="font-mono text-lg font-semibold">{acte.identifiant}</span>
    </div>
  );

  return (
    <CadreEspace
      agent={agent}
      actif="/officier"
      enTete={<span className="font-semibold">Correction de l&apos;acte {acte.identifiant}</span>}
      bandeau={bandeau}
    >
      {acte.statut !== "enregistre" ? (
        <div className="flex max-w-2xl flex-col gap-3">
          <p role="alert" className="rounded-lg bg-attention-fond px-4 py-3 font-semibold text-attention-texte">
            Cet acte n&apos;est plus « enregistré » : il ne se corrige pas ici. S&apos;il est en attente de paiement, demandez au
            Caissier de vous le renvoyer.
          </p>
          <Link href="/officier">Retour à l&apos;accueil</Link>
        </div>
      ) : (
        <>
          {acte.motif_renvoi && (
            <p role="note" className="max-w-4xl rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-[17px] text-attention-texte" data-testid="motif-renvoi">
              <strong>Renvoyé par le Caissier</strong>
              {acte.renvoye_le && ` le ${formaterDate(aujourdhuiUvira(new Date(acte.renvoye_le)))} à ${heureUvira(acte.renvoye_le)}`} — motif : « {acte.motif_renvoi} »
            </p>
          )}
          <FormulaireActe
            key={crypto.randomUUID()}
            type={{ ...acte.type, id: acte.type_acte_id, actif: true }}
            prix={prix}
            taux={taux?.taux ?? null}
            idPrevu={acte.identifiant}
            aujourdhui={aujourdhui}
            correction={{ acteId: acte.id, initial: saisieDepuisActe(acte) }}
          />
        </>
      )}
    </CadreEspace>
  );
}
