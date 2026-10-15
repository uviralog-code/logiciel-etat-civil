"use client";

import Link from "next/link";
import { useState } from "react";
import { filtrerGroupes, type GroupeFamille } from "@/lib/nouvel-acte";
import { formaterDate } from "@/lib/tarifs";

/**
 * Cartes des types d'actes, par famille, avec le filtre de la maquette
 * « Nouvel acte — Type ». Un clic ouvre la fiche de ce type.
 */
export function ChoixType({ groupes }: { groupes: GroupeFamille[] }) {
  const [filtre, setFiltre] = useState("");
  const visibles = filtrerGroupes(groupes, filtre);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[34px] font-bold">Quel acte voulez-vous établir ?</h1>
          <p className="text-[17px] text-texte-doux">Choisissez le type d&apos;acte en premier : la fiche et le prix en dépendent.</p>
        </div>
        <div className="flex flex-[0_1_380px] flex-col gap-1.5">
          <label htmlFor="filtre" className="text-[15px] font-semibold">
            Filtrer
          </label>
          <input
            id="filtre"
            type="search"
            autoComplete="off"
            placeholder="ex. naissance, célibat, exhumation…"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            className="h-12 w-full rounded-lg border border-bordure-champ bg-surface px-3.5 text-[17px]"
          />
        </div>
      </div>

      {visibles.length === 0 && (
        <p role="status" className="text-texte-doux">
          Aucun acte ne correspond à « {filtre} ».
        </p>
      )}

      {visibles.map((g) => (
        <section key={g.famille} aria-labelledby={`famille-${g.famille}`} className="flex flex-col gap-3.5">
          <h2 id={`famille-${g.famille}`} className="flex items-center gap-2.5 text-xl font-bold">
            <span aria-hidden="true" className="size-3.5 rounded" style={{ background: g.couleur }} />
            {g.nom}
          </h2>
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {g.cartes.map(({ acte, prix, disponibleLe }) => {
              const contenu = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-md px-2 py-[3px] font-mono text-[13px] font-semibold text-white"
                      style={{ background: acte.couleur ?? g.couleur }}
                    >
                      {acte.code}
                    </span>
                    <span className="text-[13px] text-texte-doux">N° {String(acte.numero).padStart(2, "0")}</span>
                  </span>
                  <span className="text-[17px] leading-[1.3] font-semibold">{acte.libelle}</span>
                  <span className="mt-auto text-[15px] text-[#374151]">
                    {disponibleLe ? `Disponible le ${formaterDate(disponibleLe)}` : prix}
                  </span>
                </>
              );
              const classe = "flex h-full min-h-[132px] flex-col gap-2.5 rounded-[10px] border border-bordure bg-surface p-4";
              return (
                <li key={acte.id} data-type={acte.code}>
                  {disponibleLe ? (
                    <span aria-disabled="true" className={`${classe} cursor-not-allowed opacity-60`}>
                      {contenu}
                    </span>
                  ) : (
                    <Link
                      href={`/officier/actes/nouveau/${acte.code}`}
                      className={`${classe} text-encre no-underline hover:border-bleu-etat hover:shadow-[inset_0_0_0_2px_#0b3d91]`}
                    >
                      {contenu}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
