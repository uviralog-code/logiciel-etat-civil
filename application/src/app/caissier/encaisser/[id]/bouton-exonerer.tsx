"use client";

import { useId, useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { aidePrecision, MOTIFS_EXONERATION, PRECISION_EXONERATION_MAX, type Refus } from "@/lib/encaissement";
import { exonerer } from "../../actions";

const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * « Exonérer (motif obligatoire)… » (maquette « Caissier — Encaissement ») :
 * motif courant + précision obligatoire (décision du fichier 38).
 */
export function BoutonExonerer({
  acte,
  montantNonPercu,
  desactive,
}: {
  acte: { id: string; identifiant: string; titulaire: string };
  /** « 30 $ » : ce à quoi l'entité renonce. */
  montantNonPercu: string;
  desactive: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [motif, setMotif] = useState("");
  const [precision, setPrecision] = useState("");
  const [erreur, setErreur] = useState<Refus | null>(null);
  const [enCours, demarrer] = useTransition();
  const id = useId();

  const ouvrir = () => {
    setMotif("");
    setPrecision("");
    setErreur(null);
    setOuverte(true);
  };
  const envoyer = () =>
    demarrer(async () => {
      setErreur(null);
      // En cas de succès, l'action ramène à l'accueil avec l'annonce
      const r = await exonerer(acte.id, acte.identifiant, motif, precision);
      if (!r.ok) setErreur(r);
    });

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        disabled={desactive}
        className="h-12 rounded-lg border border-[#00727c] bg-surface px-4 text-base font-bold text-[#00727c] hover:bg-[#e6f4f5] disabled:cursor-not-allowed disabled:border-[#c9d1dd] disabled:text-[#6b7280]"
      >
        Exonérer (motif obligatoire)…
      </button>
      {ouverte && (
        <FenetreModale titre="Exonérer l'acte" onFermer={() => setOuverte(false)} bloquee={enCours}>
          <p className="text-[15px] text-texte-doux">
            L&apos;acte <strong className="font-mono text-encre">{acte.identifiant}</strong> ({acte.titulaire}) sera délivré gratuitement :{" "}
            <strong className="text-encre">{montantNonPercu} ne seront pas perçus</strong>. L&apos;exonération et son motif figurent dans les rapports de
            l&apos;administrateur.
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur.message}
            </p>
          )}
          <fieldset className="flex flex-col gap-1" aria-invalid={erreur?.champ === "motif" ? true : undefined}>
            <legend className="mb-1.5 font-semibold">Motif de l&apos;exonération</legend>
            {MOTIFS_EXONERATION.map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-bleu-clair">
                <input
                  type="radio"
                  name={`exoneration-${id}`}
                  value={m}
                  checked={motif === m}
                  onChange={() => {
                    setMotif(m);
                    if (erreur?.champ === "motif") setErreur(null);
                  }}
                  className="size-5 accent-bleu-etat"
                />
                <span className="text-[17px]">{m}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={`precision-exo-${id}`} className="font-semibold">
              Précision (obligatoire)
            </label>
            <textarea
              id={`precision-exo-${id}`}
              rows={2}
              maxLength={PRECISION_EXONERATION_MAX}
              placeholder={aidePrecision(motif)}
              value={precision}
              onChange={(e) => {
                setPrecision(e.target.value);
                if (erreur?.champ === "precision") setErreur(null);
              }}
              aria-invalid={erreur?.champ === "precision" ? true : undefined}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setOuverte(false)} disabled={enCours} className={classeSecondaire}>
              Annuler
            </button>
            <button
              type="button"
              onClick={envoyer}
              disabled={enCours}
              className="h-12 rounded-lg bg-[#00727c] px-4 font-bold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Exonération…" : "Exonérer l'acte"}
            </button>
          </div>
        </FenetreModale>
      )}
    </>
  );
}
