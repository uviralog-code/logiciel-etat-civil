"use client";

import { useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { FAMILLES, type FamilleActe } from "@/lib/charte";
import type { ChampCatalogue } from "@/lib/catalogue";
import { changerPresenceAuCatalogue, corriger } from "./actions";
import { ChoixCouleur } from "./choix-couleur";

const classeBouton =
  "h-10 rounded-lg border border-bordure-champ bg-surface px-3 text-[15px] whitespace-nowrap text-encre hover:bg-bleu-clair";
const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/** Boutons d'une ligne du catalogue : « Modifier… », « Retirer… » ou « Remettre ». */
export function ActionsType({
  acte,
}: {
  acte: { id: string; code: string; libelle: string; famille: FamilleActe; couleur: string | null; actif: boolean };
}) {
  const [fenetre, setFenetre] = useState<"modifier" | "retirer" | null>(null);
  const [libelle, setLibelle] = useState(acte.libelle);
  const [famille, setFamille] = useState<FamilleActe>(acte.famille);
  const [couleur, setCouleur] = useState(acte.couleur ?? FAMILLES[acte.famille].couleur);
  const [erreur, setErreur] = useState<{ message: string; champ?: ChampCatalogue } | null>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const ouvrir = (f: "modifier" | "retirer") => {
    setErreur(null);
    setAnnonce(null);
    setLibelle(acte.libelle);
    setFamille(acte.famille);
    setCouleur(acte.couleur ?? FAMILLES[acte.famille].couleur);
    setFenetre(f);
  };

  const lancer = (action: () => Promise<{ ok: true; texte: string } | { ok: false; message: string; champ?: ChampCatalogue }>) =>
    demarrer(async () => {
      setErreur(null);
      const r = await action();
      if (r.ok) {
        setFenetre(null);
        setAnnonce(r.texte);
      } else {
        setErreur(r);
      }
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => ouvrir("modifier")} className={classeBouton} aria-label={`Modifier ${acte.code}`}>
          Modifier…
        </button>
        {acte.actif ? (
          <button type="button" onClick={() => ouvrir("retirer")} className={classeBouton} aria-label={`Retirer ${acte.code}`}>
            Retirer…
          </button>
        ) : (
          <button
            type="button"
            disabled={enCours}
            onClick={() => lancer(() => changerPresenceAuCatalogue(acte.id, true))}
            className={`${classeBouton} border-bleu-etat font-bold text-bleu-etat`}
            aria-label={`Remettre ${acte.code} au catalogue`}
          >
            {enCours ? "…" : "Remettre"}
          </button>
        )}
      </div>
      {annonce && (
        <span role="status" className="text-sm font-semibold text-succes-texte">
          {annonce}
        </span>
      )}
      {erreur && !fenetre && (
        <span role="alert" className="text-sm font-semibold text-erreur-texte">
          {erreur.message}
        </span>
      )}

      {fenetre === "modifier" && (
        <FenetreModale titre={`Modifier ${acte.code}`} onFermer={() => setFenetre(null)} bloquee={enCours}>
          <div className="flex flex-col gap-4 text-left">
            {erreur && (
              <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
                {erreur.message}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={`libelle-${acte.id}`} className="font-semibold">
                Nom de l&apos;acte
              </label>
              <input
                id={`libelle-${acte.id}`}
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                aria-invalid={erreur?.champ === "libelle" ? true : undefined}
                className={classeChamp}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`famille-${acte.id}`} className="font-semibold">
                Famille
              </label>
              <select id={`famille-${acte.id}`} value={famille} onChange={(e) => setFamille(e.target.value as FamilleActe)} className={classeChamp}>
                {(Object.keys(FAMILLES) as FamilleActe[]).map((f) => (
                  <option key={f} value={f}>
                    {FAMILLES[f].libelle}
                  </option>
                ))}
              </select>
            </div>
            <ChoixCouleur valeur={couleur} onChange={setCouleur} nom={`couleur-${acte.id}`} />
            <p className="text-sm text-texte-doux">
              Le code, le numéro, la fiche de détails et le tarif Étrangers sont fixés à la création.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setFenetre(null)} disabled={enCours} className={classeSecondaire}>
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => lancer(() => corriger(acte.id, { libelle, famille, couleur }))}
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </FenetreModale>
      )}

      {fenetre === "retirer" && (
        <FenetreModale titre="Retirer ce type d'acte du catalogue ?" onFermer={() => setFenetre(null)} bloquee={enCours}>
          <p className="text-left">
            <strong>
              {acte.code} — {acte.libelle}
            </strong>
          </p>
          <ul className="list-disc pl-5 text-left text-[15px] leading-normal">
            <li>Les officiers ne pourront plus enregistrer de nouvel acte de ce type.</li>
            <li>Les actes déjà enregistrés, leurs reçus et l&apos;historique des prix restent intacts.</li>
            <li>Vous pourrez le remettre au catalogue à tout moment.</li>
          </ul>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setFenetre(null)} disabled={enCours} className={classeSecondaire}>
              Garder
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => lancer(() => changerPresenceAuCatalogue(acte.id, false))}
              className="h-12 rounded-lg bg-erreur-texte px-4 font-bold text-white disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Retrait…" : "Oui, retirer du catalogue"}
            </button>
          </div>
        </FenetreModale>
      )}
    </div>
  );
}
