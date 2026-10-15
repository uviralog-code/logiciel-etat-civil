"use client";

import { useId, useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { AUTRE_MOTIF, MESSAGES_RENVOI, MOTIFS_RENVOI, PRECISION_MAX, type ResultatRenvoi } from "@/lib/accueil-caissier";
import { renvoyer } from "./actions";
import { annoncer } from "./actualisation";

const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * « Renvoyer… » (maquette « Caissier — Accueil ») : l'acte repasse chez l'Officier
 * pour correction, avec un motif courant et une précision (décision du fichier 37).
 */
export function BoutonRenvoyer({
  acte,
  surRenvoi,
  large = false,
}: {
  acte: { id: string; identifiant: string; titulaire: string };
  /** Bouton pleine largeur « Renvoyer à l'Officier (motif)… » (écran d'encaissement). */
  large?: boolean;
  /** Appelé quand l'acte a quitté la file : renvoyé (vrai), ou déjà parti depuis un autre poste (faux). */
  surRenvoi?: (renvoye: boolean) => void;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [motif, setMotif] = useState("");
  const [precision, setPrecision] = useState("");
  const [erreur, setErreur] = useState<Extract<ResultatRenvoi, { ok: false }> | null>(null);
  const [enCours, demarrer] = useTransition();
  const id = useId();
  const autre = motif === AUTRE_MOTIF;

  const ouvrir = () => {
    setMotif("");
    setPrecision("");
    setErreur(null);
    setOuverte(true);
  };
  const envoyer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await renvoyer(acte.id, motif, precision);
      if (r.ok) {
        setOuverte(false);
        annoncer(`${r.identifiant} a été renvoyé à l'Officier pour correction.`);
        surRenvoi?.(true);
      } else if (r.message === MESSAGES_RENVOI.plusEnAttente) {
        // Encaissé ou renvoyé depuis un autre poste : l'acte quitte la file
        setOuverte(false);
        annoncer(r.message);
        surRenvoi?.(false);
      } else {
        setErreur(r);
      }
    });

  return (
    <>
      {large ? (
        <button
          type="button"
          onClick={ouvrir}
          className="h-12 rounded-lg border border-bordure-champ bg-surface px-4 text-base font-semibold text-encre hover:bg-bleu-clair"
        >
          Renvoyer à l&apos;Officier (motif)…
        </button>
      ) : (
        <button
          type="button"
          onClick={ouvrir}
          aria-label={`Renvoyer ${acte.identifiant} à l'Officier`}
          className="h-11 rounded-lg border border-bordure-champ bg-surface px-3.5 text-[15px] text-encre hover:bg-bleu-clair"
        >
          Renvoyer…
        </button>
      )}
      {ouverte && (
        <FenetreModale titre="Renvoyer à l'Officier" onFermer={() => setOuverte(false)} bloquee={enCours}>
          <p className="text-[15px] text-texte-doux">
            L&apos;acte <strong className="font-mono text-encre">{acte.identifiant}</strong> ({acte.titulaire}) retourne chez l&apos;Officier pour
            correction. Il reviendra dans votre file quand l&apos;Officier l&apos;aura retransmis.
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur.message}
            </p>
          )}
          <fieldset className="flex flex-col gap-1" aria-invalid={erreur?.champ === "motif" ? true : undefined}>
            <legend className="mb-1.5 font-semibold">Motif du renvoi</legend>
            {MOTIFS_RENVOI.map((m) => (
              <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-bleu-clair">
                <input
                  type="radio"
                  name={`motif-${id}`}
                  value={m}
                  checked={motif === m}
                  onChange={() => {
                    setMotif(m);
                    setErreur(null);
                  }}
                  className="size-5 accent-bleu-etat"
                />
                <span className="text-[17px]">{m}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={`precision-${id}`} className="font-semibold">
              {autre ? "Motif (obligatoire)" : "Précision (facultative)"}
            </label>
            <textarea
              id={`precision-${id}`}
              rows={2}
              maxLength={PRECISION_MAX}
              placeholder={autre ? "Ex. : le demandeur n'a pas apporté sa carte d'électeur" : "Ex. : « Mapendo » s'écrit avec un seul p"}
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
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Renvoi…" : "Renvoyer à l'Officier"}
            </button>
          </div>
        </FenetreModale>
      )}
    </>
  );
}
