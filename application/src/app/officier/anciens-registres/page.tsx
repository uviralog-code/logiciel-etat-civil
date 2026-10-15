import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { lireLots } from "@/lib/anciens-registres";
import { lireTypesActes } from "@/lib/catalogue";
import { FAMILLES } from "@/lib/charte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira, formaterDate } from "@/lib/tarifs";
import { FormulaireLot } from "./formulaire-lot";

export const metadata: Metadata = { title: "Anciens registres" };

/** Anciens registres (fichier 36) : les lots de l'entité et l'ouverture d'un nouveau lot. */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Lots />
    </Suspense>
  );
}

const cellule = "border-b border-[#edf0f5] px-4 py-3";

async function Lots() {
  const agent = await exigerEspace("officier");
  const supabase = await creerClientServeur();
  const [lots, types] = await Promise.all([lireLots(supabase), lireTypesActes(supabase)]);

  return (
    <CadreEspace agent={agent} actif="/officier/anciens-registres">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Anciens registres</h1>
        <p className="max-w-4xl text-[17px] text-texte-doux">
          Un lot correspond à un registre papier : un seul type d&apos;acte et une seule année. Chaque ancien acte reçoit un ID, est
          classé « délivré », sans montant, et son scan est archivé.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="titre-lots" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-[10px] border border-bordure bg-surface">
          <h2 id="titre-lots" className="px-5 py-[18px] text-xl font-bold">
            Lots de l&apos;entité
          </h2>
          {lots.length === 0 ? (
            <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun lot pour l&apos;instant. Ouvrez le premier avec le formulaire.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                    {["Registre", "Type", "Actes", "État"].map((t) => (
                      <th key={t} scope="col" className="border-y border-bordure px-4 py-2.5">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id} data-lot={l.description}>
                      <td className={cellule}>
                        <Link href={`/officier/anciens-registres/${l.id}`} className="font-semibold">
                          {l.description}
                        </Link>
                        <span className="block text-sm text-texte-doux">Année {l.annee_registre}</span>
                      </td>
                      <td className={cellule}>
                        <span className="inline-block rounded-md px-2.5 py-1 text-sm font-bold text-white" style={{ background: l.type_couleur ?? FAMILLES[l.type_famille].couleur }}>
                          {l.type_code}
                        </span>
                      </td>
                      <td className={`${cellule} whitespace-nowrap`}>
                        {l.nb_actes}
                        {l.nb_scannes < l.nb_actes && <span className="block text-sm font-semibold text-attention-texte">{l.nb_actes - l.nb_scannes} scan(s) manquant(s)</span>}
                      </td>
                      <td className={`${cellule} whitespace-nowrap`}>
                        {l.statut === "ouvert" ? (
                          <span className="rounded-full bg-succes-fond px-2.5 py-1 text-sm font-bold text-succes-texte">Ouvert</span>
                        ) : (
                          <span className="text-sm text-texte-doux">Fermé le {formaterDate(aujourdhuiUvira(new Date(l.ferme_le!)))}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <FormulaireLot
          key={crypto.randomUUID()}
          types={types.filter((t) => t.actif).map((t) => ({ id: t.id, numero: t.numero, libelle: t.libelle }))}
          anneeEnCours={Number(aujourdhuiUvira().slice(0, 4))}
        />
      </div>
    </CadreEspace>
  );
}
