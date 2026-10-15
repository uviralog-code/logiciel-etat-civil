import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { libellesNoms, lireLot } from "@/lib/anciens-registres";
import { FAMILLES } from "@/lib/charte";
import { lireDernierNumero } from "@/lib/nouvel-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira, formaterDate } from "@/lib/tarifs";
import { CompteurLot } from "./compteur-lot";
import { ImportLot } from "./import-lot";

export const metadata: Metadata = { title: "Import en lot — anciens registres" };

/** Un lot d'anciens registres (fichier 36), d'après la maquette « Officier — Import en lot ». */
export default function Page({ params }: PageProps<"/officier/anciens-registres/[lot]">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Lot params={params} />
    </Suspense>
  );
}

async function Lot({ params }: { params: PageProps<"/officier/anciens-registres/[lot]">["params"] }) {
  const agent = await exigerEspace("officier");
  const { lot: id } = await params;
  const supabase = await creerClientServeur();
  // La base ne montre que les lots de l'entité de l'officier
  const detail = await lireLot(supabase, String(id));
  if (!detail) notFound();
  const { lot, actes } = detail;
  const couleur = lot.type_couleur ?? FAMILLES[lot.type_famille].couleur;
  const dernierNumero = await lireDernierNumero(supabase, lot.entite_id, lot.type_acte_id, lot.annee_registre);
  const ouvert = lot.statut === "ouvert";

  const bandeau = (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-[22px] text-white sm:px-10" style={{ background: couleur }} data-testid="bandeau-lot">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[15px] tracking-[0.06em] uppercase">
          {ouvert ? "Lot ouvert · un seul type d'acte accepté" : `Lot fermé le ${formaterDate(aujourdhuiUvira(new Date(lot.ferme_le!)))}`}
        </span>
        <span className="text-[26px] leading-tight font-bold">{lot.description}</span>
      </div>
      <CompteurLot lotId={lot.id} initial={lot.nb_actes} />
    </div>
  );

  return (
    <CadreEspace
      agent={agent}
      actif="/officier/anciens-registres"
      enTete={
        <Link href="/officier/anciens-registres" className="font-semibold">
          ‹ Tous les lots
        </Link>
      }
      bandeau={bandeau}
    >
      <ImportLot
        key={crypto.randomUUID()}
        lot={{
          id: lot.id, ouvert, annee: lot.annee_registre, modele: lot.modele_fiche, typeCode: lot.type_code,
          typeLibelle: lot.type_libelle, codeEntite: agent.profil.entite?.code ?? "", noms: libellesNoms(lot.modele_fiche),
        }}
        actes={actes}
        dernierNumero={dernierNumero}
        aujourdhui={aujourdhuiUvira()}
      />
    </CadreEspace>
  );
}
