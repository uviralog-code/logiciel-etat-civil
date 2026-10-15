"use client";

import { useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { FicheRemise } from "@/components/fiche-remise";
import type { ResultatReinitialisation } from "@/lib/gestion-compte";
import { desactiver, reinitialiser } from "./actions";

const classeBouton =
  "h-10 rounded-lg border border-bordure-champ bg-surface px-3 text-[15px] whitespace-nowrap text-encre hover:bg-bleu-clair";
const classePrincipal = "h-12 rounded-lg px-4 font-bold text-white disabled:cursor-wait disabled:opacity-75";

/**
 * Boutons d'une ligne active du tableau des comptes (fichier 22) :
 * « Mot de passe… » (réinitialisation) et « Désactiver ».
 */
export function ActionsCompte({
  id,
  nomUtilisateur,
  nomComplet,
  poste,
}: {
  id: string;
  nomUtilisateur: string;
  nomComplet: string;
  /** « Caissier · Chefferie des Bavira » */
  poste: string;
}) {
  const [fenetre, setFenetre] = useState<"mot-de-passe" | "desactivation" | null>(null);
  const [resultat, setResultat] = useState<ResultatReinitialisation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const fermer = () => {
    setFenetre(null);
    setResultat(null);
    setErreur(null);
  };

  const lancerReinitialisation = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await reinitialiser(id);
      if (r.ok) setResultat(r);
      else setErreur(r.message);
    });

  const lancerDesactivation = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await desactiver(id);
      // Réussite : le tableau est remis à jour (la ligne devient « Désactivé », le poste « À créer »)
      if (r.ok) fermer();
      else setErreur(r.message);
    });

  const nouveauMotDePasse = resultat?.ok ? resultat : null;

  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => setFenetre("mot-de-passe")} className={classeBouton} aria-label={`Mot de passe de ${nomUtilisateur}`}>
        Mot de passe…
      </button>
      <button type="button" onClick={() => setFenetre("desactivation")} className={classeBouton} aria-label={`Désactiver ${nomUtilisateur}`}>
        Désactiver
      </button>

      {fenetre === "mot-de-passe" && (
        <FenetreModale
          titre={nouveauMotDePasse ? "Nouveau mot de passe provisoire" : "Réinitialiser le mot de passe"}
          onFermer={fermer}
          bloquee={enCours || Boolean(nouveauMotDePasse)}
        >
          {nouveauMotDePasse ? (
            <>
              <p>
                <strong>{nomComplet}</strong> (<span className="font-mono">{nomUtilisateur}</span>)
              </p>
              <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-[#c5d4ee] bg-[#f0f5ff] p-4">
                <span className="text-[15px] font-semibold text-bleu-etat">Mot de passe provisoire (affiché une seule fois)</span>
                <span data-testid="nouveau-mot-de-passe" className="font-mono text-2xl font-semibold tracking-[0.06em]">
                  {nouveauMotDePasse.motDePasse}
                </span>
                <span className="text-sm text-[#374151]">
                  Remettez-le à l&apos;agent en main propre. Il devra le changer à sa prochaine connexion.
                </span>
              </div>
              <FicheRemise
                fiche={{ nomComplet, nomUtilisateur, poste, motDePasse: nouveauMotDePasse.motDePasse, motif: "reinitialisation" }}
              />
              <button type="button" onClick={fermer} className={`${classePrincipal} bg-bleu-etat hover:bg-bleu-etat-fonce`}>
                J&apos;ai noté le mot de passe
              </button>
            </>
          ) : (
            <>
              <p className="leading-normal">
                Un nouveau mot de passe provisoire va être tiré au hasard pour <strong>{nomComplet}</strong> (
                <span className="font-mono">{nomUtilisateur}</span>).
              </p>
              <ul className="list-disc space-y-1 pl-5 leading-normal text-texte-doux">
                <li>son mot de passe actuel ne fonctionnera plus ;</li>
                <li>ses sessions ouvertes sont fermées aussitôt ;</li>
                <li>il devra choisir un nouveau mot de passe à sa prochaine connexion.</li>
              </ul>
              {erreur && (
                <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
                  {erreur}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={fermer} disabled={enCours} className={classeBouton}>
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={lancerReinitialisation}
                  disabled={enCours}
                  className={`${classePrincipal} bg-bleu-etat hover:bg-bleu-etat-fonce`}
                >
                  {enCours ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
                </button>
              </div>
            </>
          )}
        </FenetreModale>
      )}

      {fenetre === "desactivation" && (
        <FenetreModale titre="Désactiver le compte" onFermer={fermer} bloquee={enCours}>
          <p className="leading-normal">
            <strong>{nomComplet}</strong> (<span className="font-mono">{nomUtilisateur}</span>) — {poste}
          </p>
          <ul className="list-disc space-y-1 pl-5 leading-normal text-texte-doux">
            <li>l&apos;agent ne pourra plus se connecter et perd aussitôt tous ses droits ;</li>
            <li>son compte est conservé pour l&apos;historique, sous un nom d&apos;archive ;</li>
            <li>le poste redevient « À créer » : vous pourrez y créer le compte du remplaçant.</li>
          </ul>
          <p className="rounded-lg bg-attention-fond px-3.5 py-2.5 font-semibold text-attention-texte">
            Cette opération ne peut pas être annulée. Si l&apos;agent revient, il faudra lui créer un nouveau compte.
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={fermer} disabled={enCours} className={classeBouton}>
              Annuler
            </button>
            <button
              type="button"
              onClick={lancerDesactivation}
              disabled={enCours}
              className={`${classePrincipal} bg-erreur-texte hover:bg-[#6d1414]`}
            >
              {enCours ? "Désactivation…" : "Désactiver le compte"}
            </button>
          </div>
        </FenetreModale>
      )}
    </div>
  );
}
