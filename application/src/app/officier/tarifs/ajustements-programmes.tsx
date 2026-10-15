"use client";

import { useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { LIBELLE_CATEGORIE, libelleActe } from "@/lib/grille-commune";
import type { AjustementProgramme } from "@/lib/tarifs-entite";
import { formaterDate, formaterMontant, type PrixApplique } from "@/lib/tarifs";
import { annuler } from "./actions";

const cellule = "border-b border-[#edf0f5] px-4 py-3";
const prix = (p: PrixApplique | null) =>
  p ? `${formaterMontant(p.montant, p.devise)}${p.source === "commune" ? " (grille commune)" : ""}` : "—";

/**
 * « Ajustements programmés » de l'entité : tant qu'un ajustement n'est pas en
 * vigueur, l'officier peut l'annuler (puis en programmer un autre).
 */
export function AjustementsProgrammes({ ajustements }: { ajustements: AjustementProgramme[] }) {
  const [choisi, setChoisi] = useState<AjustementProgramme | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const confirmer = () =>
    demarrer(async () => {
      if (!choisi) return;
      const r = await annuler(choisi.ligne.id);
      if (r.ok) {
        setAnnonce(`Ajustement annulé : ${choisi.acte.code}, prévu le ${formaterDate(choisi.ligne.en_vigueur_depuis)}.`);
        setChoisi(null);
      } else {
        setErreur(r.message);
      }
    });

  return (
    <section aria-labelledby="titre-ajustements" className="flex flex-col gap-3">
      <h2 id="titre-ajustements" className="text-xl font-bold">
        Ajustements programmés
      </h2>
      {annonce && (
        <p role="status" className="self-start rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          {annonce}
        </p>
      )}
      {ajustements.length === 0 ? (
        <p className="text-texte-doux">Aucun ajustement programmé.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-[10px] border border-bordure bg-surface">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                {["À partir du", "Acte", "Prix", "Motif"].map((t) => (
                  <th key={t} scope="col" className="border-b border-bordure px-4 py-2.5">
                    {t}
                  </th>
                ))}
                <th scope="col" className="border-b border-bordure px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ajustements.map((a) => (
                <tr key={a.ligne.id} data-ajustement={a.acte.code}>
                  <td className={`${cellule} font-semibold whitespace-nowrap`}>{formaterDate(a.ligne.en_vigueur_depuis)}</td>
                  <td className={cellule}>
                    {libelleActe(a.acte)}
                    {a.acte.tarif_distinct_etranger && (
                      <span className="text-texte-doux"> ({LIBELLE_CATEGORIE[a.ligne.categorie].toLowerCase()})</span>
                    )}
                  </td>
                  <td className={cellule}>
                    <span className="text-texte-doux">{prix(a.avant)}</span>
                    {" → "}
                    <strong className="text-bleu-etat">{prix(a.apres)}</strong>
                  </td>
                  <td className={`${cellule} text-[15px]`}>{a.ligne.motif ?? "—"}</td>
                  <td className={`${cellule} text-right`}>
                    <button
                      type="button"
                      onClick={() => {
                        setErreur(null);
                        setAnnonce(null);
                        setChoisi(a);
                      }}
                      aria-label={`Annuler l'ajustement ${a.acte.code} du ${formaterDate(a.ligne.en_vigueur_depuis)}`}
                      className="h-10 rounded-lg border border-bordure-champ bg-surface px-3 text-[15px] whitespace-nowrap text-encre hover:bg-bleu-clair"
                    >
                      Annuler…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {choisi && (
        <FenetreModale titre="Annuler cet ajustement ?" onFermer={() => setChoisi(null)} bloquee={enCours}>
          <p>
            <strong>{libelleActe(choisi.acte)}</strong>
            {choisi.acte.tarif_distinct_etranger && ` · ${LIBELLE_CATEGORIE[choisi.ligne.categorie]}`}
            <br />
            {prix(choisi.apres)} prévu à partir du {formaterDate(choisi.ligne.en_vigueur_depuis)}.
          </p>
          <p className="text-[15px]">
            Le prix de {prix(choisi.avant)} restera appliqué. L&apos;annulation est inscrite au journal d&apos;audit.
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setChoisi(null)}
              disabled={enCours}
              className="h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair"
            >
              Garder
            </button>
            <button
              type="button"
              onClick={confirmer}
              disabled={enCours}
              className="h-12 rounded-lg bg-erreur-texte px-4 font-bold text-white disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Annulation…" : "Oui, annuler cet ajustement"}
            </button>
          </div>
        </FenetreModale>
      )}
    </section>
  );
}
