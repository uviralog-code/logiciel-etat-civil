import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { exigerEspace } from "@/lib/acces";
import { FAMILLES } from "@/lib/charte";
import { idPrevu, lireDernierNumero, lireTypeParCode, prixSelonCategorie } from "@/lib/nouvel-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lignesTarifsEntite, lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, lireDonneesTarifaires, lireTauxEnVigueur } from "@/lib/tarifs";
import { FormulaireActe } from "./formulaire-acte";

export const metadata: Metadata = { title: "Nouvel acte — fiche" };

/** Étape 2 de la saisie (fichier 29) : la fiche (maquette « Nouvel acte — Fiche »). */
export default function Page({ params }: PageProps<"/officier/actes/nouveau/[code]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Fiche params={params} />
    </Suspense>
  );
}

async function Fiche({ params }: { params: PageProps<"/officier/actes/nouveau/[code]">["params"] }) {
  const agent = await exigerEspace("officier");
  const { code } = await params;
  const supabase = await creerClientServeur();
  const [type, entite] = await Promise.all([lireTypeParCode(supabase, String(code)), lireEntite(supabase, agent.profil.entite?.code ?? "")]);
  if (!type) notFound(); // inconnu, ou retiré du catalogue
  if (!entite) throw new Error("Entité de l'officier introuvable.");

  const aujourdhui = aujourdhuiUvira();
  const [donnees, taux, dernier] = await Promise.all([
    lireDonneesTarifaires(supabase, { entiteId: entite.id }),
    lireTauxEnVigueur(supabase, entite.id),
    lireDernierNumero(supabase, entite.id, type.id, Number(aujourdhui.slice(0, 4))),
  ]);
  const lignes = lignesTarifsEntite(donnees, entite.id, aujourdhui);
  const prix = { national: prixSelonCategorie(lignes, type.id, "national"), etranger: prixSelonCategorie(lignes, type.id, "etranger") };
  const couleur = type.couleur ?? FAMILLES[type.famille].couleur;

  const bandeau = (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px] text-white sm:px-10" style={{ background: couleur }} data-testid="bandeau-type">
      <div className="flex flex-wrap items-center gap-4">
        <span className="rounded-md bg-white px-2.5 py-1 font-mono text-[15px] font-semibold" style={{ color: couleur }}>
          {type.code}
        </span>
        <span className="text-[26px] font-bold tracking-[0.02em] uppercase">{type.libelle}</span>
      </div>
      <Link href="/officier/actes/nouveau" className="font-semibold text-white hover:text-white/85">
        Changer de type d&apos;acte
      </Link>
    </div>
  );

  return (
    <CadreEspace agent={agent} actif="/officier/actes/nouveau" enTete={<EtapesSaisie courante={2} />} bandeau={bandeau}>
      {prix.national ? (
        // Nouvelle clé à chaque visite : jamais les informations de l'acte précédent dans une nouvelle fiche
        <FormulaireActe
          key={crypto.randomUUID()}
          type={type}
          prix={prix}
          taux={taux?.taux ?? null}
          idPrevu={idPrevu(entite.code, type.code, Number(aujourdhui.slice(0, 4)), dernier)}
          aujourdhui={aujourdhui}
        />
      ) : (
        <p role="alert" className="max-w-2xl rounded-lg bg-attention-fond px-4 py-3 font-semibold text-attention-texte">
          Cet acte n&apos;a pas encore de prix en vigueur : il ne peut pas être enregistré aujourd&apos;hui.
        </p>
      )}
    </CadreEspace>
  );
}
