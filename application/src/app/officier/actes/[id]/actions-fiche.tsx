"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import type { ResultatActe } from "@/lib/actes";
import type { ActionsPossibles } from "@/lib/fiche-acte";
import { annuler, corrigerNom, delivrer } from "../actions";

const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classeContour = "inline-flex h-12 items-center rounded-lg border px-5 text-[17px] font-bold whitespace-nowrap";
const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * Boutons de la fiche d'un acte (maquette) : « Corriger l'orthographe d'un nom »,
 * « Marquer comme délivré », « Annuler l'acte… » — selon ce que le statut permet.
 */
export function ActionsFiche({
  acte,
  possibles,
}: {
  acte: { id: string; identifiant: string; titulaire: string; titulaire2: string | null; demandeur: string | null; deuxEpoux: boolean; libelleTitulaire: string };
  possibles: ActionsPossibles;
}) {
  const [fenetre, setFenetre] = useState<"nom" | "annuler" | "delivrer" | null>(null);
  const [noms, setNoms] = useState({ titulaire: acte.titulaire, titulaire2: acte.titulaire2 ?? "", demandeur: acte.demandeur ?? "", motif: "" });
  const [motifAnnulation, setMotifAnnulation] = useState("");
  const [erreur, setErreur] = useState<{ message: string; champ?: string } | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const ouvrir = (f: "nom" | "annuler" | "delivrer") => {
    setErreur(null);
    setAnnonce(null);
    setNoms({ titulaire: acte.titulaire, titulaire2: acte.titulaire2 ?? "", demandeur: acte.demandeur ?? "", motif: "" });
    setMotifAnnulation("");
    setFenetre(f);
  };
  const lancer = (action: () => Promise<ResultatActe>, texte: string) =>
    demarrer(async () => {
      setErreur(null);
      const r = await action();
      if (r.ok) {
        setFenetre(null);
        setAnnonce(texte);
      } else {
        setErreur(r);
      }
    });
  const enErreur = (c: string) => (erreur?.champ === c ? true : undefined);
  const erreurDansFenetre = erreur && (
    <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
      {erreur.message}
    </p>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-3">
        {possibles.corrigerFiche && (
          <Link href={`/officier/actes/${acte.id}/corriger`} className={`${classeContour} border-bleu-etat bg-surface text-bleu-etat hover:bg-bleu-clair`}>
            Corriger la fiche
          </Link>
        )}
        {possibles.corrigerNom && (
          <button type="button" onClick={() => ouvrir("nom")} className={`${classeContour} border-bleu-etat bg-surface text-bleu-etat hover:bg-bleu-clair`}>
            Corriger l&apos;orthographe d&apos;un nom
          </button>
        )}
        {possibles.delivrer && (
          <button type="button" onClick={() => ouvrir("delivrer")} className={`${classeContour} border-bleu-etat bg-bleu-etat text-white hover:bg-bleu-etat-fonce`}>
            Marquer comme délivré
          </button>
        )}
        {possibles.annuler && (
          <button type="button" onClick={() => ouvrir("annuler")} className={`${classeContour} border-[#b42318] bg-surface text-[#b42318] hover:bg-erreur-fond`}>
            Annuler l&apos;acte…
          </button>
        )}
      </div>
      {annonce && (
        <p role="status" className="font-semibold text-succes-texte">
          {annonce}
        </p>
      )}
      {possibles.annulationParLaCaisse && (
        <p className="max-w-md text-right text-sm text-texte-doux">
          Acte payé : pour l&apos;annuler, le Caissier annule son reçu (avant la clôture de la journée).
        </p>
      )}

      {fenetre === "nom" && (
        <FenetreModale titre="Corriger l'orthographe d'un nom" onFermer={() => setFenetre(null)} bloquee={enCours}>
          <p className="text-[15px] text-texte-doux">
            Seuls les noms se corrigent après le paiement. Le motif est inscrit au journal d&apos;audit, avec l&apos;ancien et le nouveau nom.
          </p>
          {erreurDansFenetre}
          <div className="flex flex-col gap-2">
            <label htmlFor="nom-titulaire" className="font-semibold">
              {acte.libelleTitulaire}
            </label>
            <input id="nom-titulaire" value={noms.titulaire} onChange={(e) => setNoms({ ...noms, titulaire: e.target.value })} aria-invalid={enErreur("titulaire")} className={classeChamp} />
          </div>
          {acte.deuxEpoux && (
            <div className="flex flex-col gap-2">
              <label htmlFor="nom-titulaire2" className="font-semibold">
                Épouse
              </label>
              <input id="nom-titulaire2" value={noms.titulaire2} onChange={(e) => setNoms({ ...noms, titulaire2: e.target.value })} aria-invalid={enErreur("titulaire2")} className={classeChamp} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="nom-demandeur" className="font-semibold">
              Demandeur
            </label>
            <input id="nom-demandeur" value={noms.demandeur} onChange={(e) => setNoms({ ...noms, demandeur: e.target.value })} aria-invalid={enErreur("demandeur")} className={classeChamp} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="nom-motif" className="font-semibold">
              Motif de la correction
            </label>
            <textarea
              id="nom-motif"
              rows={2}
              maxLength={300}
              placeholder="Ex. : le demandeur a présenté sa carte d'électeur"
              value={noms.motif}
              onChange={(e) => setNoms({ ...noms, motif: e.target.value })}
              aria-invalid={enErreur("motif")}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setFenetre(null)} disabled={enCours} className={classeSecondaire}>
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => lancer(() => corrigerNom(acte.id, noms, acte.deuxEpoux), "Correction enregistrée et inscrite au journal.")}
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Enregistrement…" : "Enregistrer la correction"}
            </button>
          </div>
        </FenetreModale>
      )}

      {fenetre === "delivrer" && (
        <FenetreModale titre="Marquer comme délivré ?" onFermer={() => setFenetre(null)} bloquee={enCours}>
          <p>
            Le document <strong>{acte.identifiant}</strong>, signé et cacheté, est remis au demandeur.
          </p>
          <p className="text-[15px] text-texte-doux">Pensez à le scanner avant la clôture de la journée, si ce n&apos;est pas déjà fait.</p>
          {erreurDansFenetre}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setFenetre(null)} disabled={enCours} className={classeSecondaire}>
              Pas encore
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => lancer(() => delivrer(acte.id), "Acte marqué « délivré ».")}
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Enregistrement…" : "Oui, il est délivré"}
            </button>
          </div>
        </FenetreModale>
      )}

      {fenetre === "annuler" && (
        <FenetreModale titre="Annuler cet acte ?" onFermer={() => setFenetre(null)} bloquee={enCours}>
          <p>
            <strong>{acte.identifiant}</strong> — {acte.titulaire}
          </p>
          <p className="rounded-lg bg-erreur-fond px-3.5 py-2.5 text-[15px] text-erreur-texte">
            L&apos;annulation est <strong>définitive</strong>. L&apos;ID ne sera jamais réutilisé ; l&apos;acte reste visible, marqué « annulé ».
          </p>
          {erreurDansFenetre}
          <div className="flex flex-col gap-2">
            <label htmlFor="motif-annulation" className="font-semibold">
              Motif de l&apos;annulation
            </label>
            <textarea
              id="motif-annulation"
              rows={2}
              maxLength={300}
              value={motifAnnulation}
              onChange={(e) => setMotifAnnulation(e.target.value)}
              aria-invalid={enErreur("motif")}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setFenetre(null)} disabled={enCours} className={classeSecondaire}>
              Garder l&apos;acte
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => lancer(() => annuler(acte.id, motifAnnulation), "Acte annulé.")}
              className="h-12 rounded-lg bg-erreur-texte px-4 font-bold text-white disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Annulation…" : "Oui, annuler définitivement"}
            </button>
          </div>
        </FenetreModale>
      )}
    </div>
  );
}
