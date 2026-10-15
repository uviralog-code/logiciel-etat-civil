"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import {
  demandeConfirmation,
  ecartAvec,
  exempleConversion,
  formaterEcart,
  formaterNombreTaux,
  lireTaux,
  TAUX_MAXIMUM,
  TAUX_MINIMUM,
} from "@/lib/taux";
import { enregistrer } from "./actions";

const classePrincipal =
  "h-[52px] rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75";
const classeSecondaire = "h-[52px] rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * « Saisir le taux du jour » : un seul chiffre, les francs pour 1 dollar.
 * Un écart de plus de 10 % avec le taux précédent demande une confirmation.
 */
export function FormulaireTaux({ precedent }: { precedent: number | null }) {
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<number | null>(null);
  const [enCours, demarrer] = useTransition();

  const lu = texte.trim() ? lireTaux(texte) : null;
  const tauxValable = typeof lu === "number" ? lu : null;

  const envoyer = (taux: number) =>
    demarrer(async () => {
      const r = await enregistrer(String(taux));
      setAConfirmer(null);
      if (r.ok) {
        setSucces(`Taux enregistré : ${formaterNombreTaux(r.taux)} FC pour 1 $, à ${r.heure}. Il s'applique dès maintenant.`);
        setTexte("");
      } else {
        setErreur(r.message);
      }
    });

  const valider = (e: FormEvent) => {
    e.preventDefault();
    setSucces(null);
    const taux = lireTaux(texte);
    if (typeof taux === "string") return setErreur(taux);
    setErreur(null);
    if (demandeConfirmation(taux, precedent)) return setAConfirmer(taux);
    envoyer(taux);
  };

  return (
    <form id="saisir-taux" onSubmit={valider} noValidate aria-labelledby="titre-saisie" className="flex flex-col gap-[18px]">
      <h2 id="titre-saisie" className="text-xl font-bold">
        Saisir le taux du jour
      </h2>

      {succes && (
        <p role="status" className="rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          {succes}
        </p>
      )}
      {erreur && (
        <p id="erreur-taux" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {erreur}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="taux" className="font-semibold">
          Francs congolais pour 1 dollar
        </label>
        <div className="flex items-center gap-3">
          <input
            id="taux"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={precedent ? formaterNombreTaux(precedent) : "2 850"}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? "erreur-taux aide-taux" : "aide-taux"}
            className="h-14 w-full max-w-[220px] min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-right font-mono text-2xl font-semibold text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
          />
          <span className="text-lg font-semibold whitespace-nowrap">FC pour 1 $</span>
        </div>
        <span id="aide-taux" className="text-sm text-texte-doux" data-testid="aide-taux">
          {tauxValable
            ? `Exemple : ${exempleConversion(tauxValable)}.`
            : `Entre ${formaterNombreTaux(TAUX_MINIMUM)} et ${formaterNombreTaux(TAUX_MAXIMUM)} FC.`}
        </span>
      </div>

      <button type="submit" disabled={enCours} className={`${classePrincipal} self-start`}>
        {enCours && aConfirmer == null ? "Enregistrement…" : "Enregistrer le taux"}
      </button>

      {aConfirmer != null && (
        <FenetreModale titre="Vérifiez le taux" onFermer={() => setAConfirmer(null)} bloquee={enCours}>
          <div className="flex flex-col gap-3.5" data-testid="confirmation-taux">
            <p className="flex flex-wrap items-baseline gap-3 rounded-lg border border-[#e8c66a] bg-attention-fond px-4 py-3 text-attention-texte">
              <span className="text-xl line-through decoration-1">{formaterNombreTaux(precedent!)} FC</span>
              <span aria-hidden="true" className="text-xl">→</span>
              <span className="text-2xl font-bold">{formaterNombreTaux(aConfirmer)} FC</span>
              <span className="w-full text-[15px] font-semibold">
                Le taux change de {formaterEcart(ecartAvec(aConfirmer, precedent)!)} par rapport au taux précédent.
              </span>
            </p>
            <p>Est-ce bien le bon chiffre ? Une erreur ici changerait le montant de tous les encaissements en dollars.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setAConfirmer(null)} disabled={enCours} className={classeSecondaire}>
              Corriger
            </button>
            <button type="button" onClick={() => envoyer(aConfirmer)} disabled={enCours} className={classePrincipal}>
              {enCours ? "Enregistrement…" : "Oui, enregistrer ce taux"}
            </button>
          </div>
        </FenetreModale>
      )}
    </form>
  );
}
