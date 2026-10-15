"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dateDuJour } from "@/lib/espaces";
import { LisereDrapeau } from "./lisere-drapeau";

export interface DonneesFiche {
  nomComplet: string;
  nomUtilisateur: string;
  motDePasse: string;
  /** « Caissier · Chefferie des Bavira » */
  poste?: string;
  motif: "creation" | "reinitialisation";
}

const abonnementVide = () => () => {};

/**
 * Fiche de remise imprimable (proposée par Claude, validée au fichier 21) :
 * l'administrateur l'imprime et la remet à l'agent en main propre, au lieu de
 * recopier le mot de passe provisoire à la main.
 *
 * Elle est invisible à l'écran ; à l'impression, elle est la SEULE chose
 * imprimée (voir la règle « @media print » dans globals.css).
 */
export function FicheRemise({ fiche }: { fiche: DonneesFiche }) {
  // Adresse du logiciel, lue dans le navigateur (vide lors de la préparation côté serveur)
  const adresse = useSyncExternalStore(abonnementVide, () => window.location.origin, () => "");
  const monte = useSyncExternalStore(abonnementVide, () => true, () => false);

  const imprimer = () => window.print();

  return (
    <>
      <button
        type="button"
        onClick={imprimer}
        className="flex h-12 items-center justify-center gap-2 rounded-lg border border-bleu-etat bg-surface px-4 font-bold text-bleu-etat hover:bg-bleu-clair"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z" />
        </svg>
        Imprimer la fiche de remise
      </button>
      {monte &&
        createPortal(
          <section data-testid="fiche-remise" className="fiche-remise hidden bg-white p-10 font-sans text-encre" aria-hidden="true">
            <LisereDrapeau />
            <p className="mt-6 text-sm tracking-[0.04em] uppercase">
              République Démocratique du Congo · Province du Sud-Kivu · Ville d&apos;Uvira
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold">Registre numérique de l&apos;état civil</h1>
            <p className="mt-1 text-lg">
              {fiche.motif === "creation" ? "Fiche de remise — nouveau compte" : "Fiche de remise — mot de passe réinitialisé"}
            </p>

            <table className="mt-8 w-full border-collapse text-lg">
              <tbody>
                {[
                  ["Agent", fiche.nomComplet],
                  ...(fiche.poste ? [["Poste", fiche.poste]] : []),
                  ["Adresse du logiciel", adresse],
                  ["Nom d'utilisateur", fiche.nomUtilisateur],
                  ["Mot de passe provisoire", fiche.motDePasse],
                ].map(([libelle, valeur]) => (
                  <tr key={libelle}>
                    <th className="w-[38%] border border-[#9aa5b5] px-4 py-3 text-left font-semibold">{libelle}</th>
                    <td
                      className={`border border-[#9aa5b5] px-4 py-3 ${
                        libelle === "Nom d'utilisateur" || libelle === "Mot de passe provisoire" ? "font-mono text-xl font-semibold" : ""
                      }`}
                    >
                      {valeur}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="mt-8 text-xl font-bold">Consignes</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-6 text-lg leading-normal">
              <li>Ouvrez le logiciel et connectez-vous avec ce nom d&apos;utilisateur et ce mot de passe provisoire.</li>
              <li>Choisissez aussitôt votre propre mot de passe : au moins 10 caractères, que vous seul connaissez.</li>
              <li>Ne communiquez jamais votre mot de passe, même à un collègue. Rangez ou détruisez cette fiche.</li>
              <li>Mot de passe oublié : adressez-vous à l&apos;administrateur (CDJP).</li>
            </ol>

            <div className="mt-12 grid grid-cols-2 gap-10 text-lg">
              <div>
                <p>Remis le {dateDuJour()}</p>
                <p className="mt-1">par l&apos;administrateur (CDJP)</p>
                <p className="mt-10 border-t border-encre pt-1 text-sm">Signature</p>
              </div>
              <div>
                <p>Reçu par {fiche.nomComplet}</p>
                <p className="mt-1">&nbsp;</p>
                <p className="mt-10 border-t border-encre pt-1 text-sm">Signature de l&apos;agent</p>
              </div>
            </div>
          </section>,
          document.body,
        )}
    </>
  );
}
