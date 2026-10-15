"use client";

import { useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { LIBELLE_CATEGORIE, libelleActe, type ChangementProgramme } from "@/lib/grille-commune";
import { formaterDate, formaterMontant } from "@/lib/tarifs";
import { annuler } from "./actions";

const cellule = "border-b border-[#edf0f5] px-4 py-3";

/**
 * « Changements programmés » : la grille commune à venir. Tant qu'un changement
 * n'est pas entré en vigueur, l'administrateur peut l'annuler (une faute de frappe,
 * un arrêté reporté…). Une fois en vigueur, il fait partie de l'historique.
 */
export function ChangementsProgrammes({ changements }: { changements: ChangementProgramme[] }) {
  const [choisi, setChoisi] = useState<ChangementProgramme | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const confirmer = () =>
    demarrer(async () => {
      if (!choisi) return;
      const r = await annuler(choisi.ligne.id);
      if (r.ok) {
        setAnnonce(`Changement annulé : ${choisi.acte.code}, prévu le ${formaterDate(choisi.ligne.en_vigueur_depuis)}.`);
        setChoisi(null);
      } else {
        setErreur(r.message);
      }
    });

  return (
    <section aria-labelledby="titre-programmes" className="flex flex-col gap-3">
      <h2 id="titre-programmes" className="text-xl font-bold">
        Changements programmés
      </h2>
      {annonce && (
        <p role="status" className="self-start rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          {annonce}
        </p>
      )}
      {changements.length === 0 ? (
        <p className="text-texte-doux">Aucun changement programmé : la grille ci-dessus reste en vigueur.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-[10px] border border-bordure bg-surface">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                {["À partir du", "Acte", "Catégorie", "Prix", "Texte de référence"].map((t) => (
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
              {changements.map((c) => (
                <tr key={c.ligne.id} data-changement={c.acte.code}>
                  <td className={`${cellule} font-semibold whitespace-nowrap`}>{formaterDate(c.ligne.en_vigueur_depuis)}</td>
                  <td className={cellule}>{libelleActe(c.acte)}</td>
                  <td className={cellule}>{c.acte.tarif_distinct_etranger ? LIBELLE_CATEGORIE[c.ligne.categorie] : "—"}</td>
                  <td className={`${cellule} whitespace-nowrap`}>
                    <span className="text-texte-doux">{c.avant ? formaterMontant(c.avant.montant, c.avant.devise) : "—"}</span>
                    {" → "}
                    <strong className="text-bleu-etat">{formaterMontant(c.ligne.montant, c.ligne.devise)}</strong>
                  </td>
                  <td className={`${cellule} text-[15px]`}>{c.ligne.motif ?? "—"}</td>
                  <td className={`${cellule} text-right`}>
                    <button
                      type="button"
                      onClick={() => {
                        setErreur(null);
                        setAnnonce(null);
                        setChoisi(c);
                      }}
                      aria-label={`Annuler le changement ${c.acte.code} du ${formaterDate(c.ligne.en_vigueur_depuis)}`}
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
        <FenetreModale titre="Annuler ce changement ?" onFermer={() => setChoisi(null)} bloquee={enCours}>
          <p>
            <strong>{libelleActe(choisi.acte)}</strong>
            {choisi.acte.tarif_distinct_etranger && ` · ${LIBELLE_CATEGORIE[choisi.ligne.categorie]}`}
            <br />
            {formaterMontant(choisi.ligne.montant, choisi.ligne.devise)} prévu à partir du {formaterDate(choisi.ligne.en_vigueur_depuis)}.
          </p>
          <p className="text-[15px]">
            {choisi.avant
              ? `Le prix de ${formaterMontant(choisi.avant.montant, choisi.avant.devise)} restera en vigueur.`
              : "Cet acte n'aura pas de prix à cette date."}{" "}
            L&apos;annulation est inscrite au journal d&apos;audit.
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
              {enCours ? "Annulation…" : "Oui, annuler ce changement"}
            </button>
          </div>
        </FenetreModale>
      )}
    </section>
  );
}
