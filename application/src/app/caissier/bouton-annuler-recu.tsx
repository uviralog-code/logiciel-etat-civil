"use client";

import { useId, useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { messageAnnulation, type ResultatAnnulation, type SuiteAnnulation } from "@/lib/recus-du-jour";
import { annulerLeRecu } from "./actions";
import { annoncer } from "./actualisation";

const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * « Annuler… » un reçu (fichier 40) : motif en texte libre ; le Caissier choisit
 * ce que devient l'acte. Possible le jour même, avant la clôture de la caisse.
 */
export function BoutonAnnulerRecu({
  recu,
}: {
  recu: { id: string; numero: string; montant: string; acte: string; titulaire: string; peutRevenirEnFile: boolean };
}) {
  const [ouverte, setOuverte] = useState(false);
  const [suite, setSuite] = useState<SuiteAnnulation | "">("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<Extract<ResultatAnnulation, { ok: false }> | null>(null);
  const [enCours, demarrer] = useTransition();
  const id = useId();

  const ouvrir = () => {
    setSuite(recu.peutRevenirEnFile ? "" : "annuler-acte");
    setMotif("");
    setErreur(null);
    setOuverte(true);
  };
  const envoyer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await annulerLeRecu(recu.id, motif, suite);
      if (r.ok) {
        setOuverte(false);
        annoncer(messageAnnulation(r));
      } else {
        setErreur(r);
      }
    });

  const option = (valeur: SuiteAnnulation, titre: string, texte: string, desactive = false) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 ${
        suite === valeur ? "border-2 border-bleu-etat bg-bleu-clair" : "border-bordure-champ"
      } ${desactive ? "cursor-not-allowed opacity-55" : ""}`}
    >
      <input
        type="radio"
        name={`suite-${id}`}
        checked={suite === valeur}
        disabled={desactive}
        onChange={() => {
          setSuite(valeur);
          if (erreur?.champ === "suite") setErreur(null);
        }}
        className="mt-1 size-5 shrink-0 accent-bleu-etat"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{titre}</span>
        <span className="text-[15px] text-texte-doux">{texte}</span>
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        aria-label={`Annuler le reçu ${recu.numero}`}
        className="h-10 rounded-lg border border-[#b42318] bg-surface px-3.5 text-[15px] font-semibold text-[#b42318] hover:bg-erreur-fond"
      >
        Annuler…
      </button>
      {ouverte && (
        <FenetreModale titre={`Annuler le reçu ${recu.numero}`} onFermer={() => setOuverte(false)} bloquee={enCours}>
          <p className="text-[15px] text-texte-doux">
            Acte <strong className="font-mono text-encre">{recu.acte}</strong> ({recu.titulaire}) ·{" "}
            <strong className="text-encre">{recu.montant}</strong> à rendre à l&apos;usager. Le reçu restera dans le registre avec la mention « ANNULÉ ».
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur.message}
            </p>
          )}
          <fieldset className="flex flex-col gap-2" aria-invalid={erreur?.champ === "suite" ? true : undefined}>
            <legend className="mb-1.5 font-semibold">Que devient l&apos;acte ?</legend>
            {option(
              "remettre",
              "Erreur de caisse : remettre l'acte dans la file",
              recu.peutRevenirEnFile
                ? "Mauvaise monnaie, mauvais acte encaissé… L'acte revient « À encaisser » pour un nouveau reçu."
                : "Impossible : l'acte est déjà délivré.",
              !recu.peutRevenirEnFile,
            )}
            {option("annuler-acte", "Erreur sur l'acte : annuler aussi l'acte", "L'Officier devra enregistrer un nouvel acte.")}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={`motif-${id}`} className="font-semibold">
              Motif de l&apos;annulation
            </label>
            <textarea
              id={`motif-${id}`}
              rows={2}
              maxLength={300}
              placeholder="Ex. : l'usager voulait payer en dollars"
              value={motif}
              onChange={(e) => {
                setMotif(e.target.value);
                if (erreur?.champ === "motif") setErreur(null);
              }}
              aria-invalid={erreur?.champ === "motif" ? true : undefined}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setOuverte(false)} disabled={enCours} className={classeSecondaire}>
              Garder le reçu
            </button>
            <button
              type="button"
              onClick={envoyer}
              disabled={enCours}
              className="h-12 rounded-lg bg-[#b42318] px-4 font-bold text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Annulation…" : "Annuler le reçu"}
            </button>
          </div>
        </FenetreModale>
      )}
    </>
  );
}
