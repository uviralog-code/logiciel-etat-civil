"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import type { Devise } from "@/lib/charte";
import { montantAPercevoir, monnaieARendre } from "@/lib/encaissement";
import { formaterMontant } from "@/lib/tarifs";
import { encaisser } from "../../actions";

const classeSecondaire = "h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";
const NOMS_MONNAIES: Record<Devise, string> = { USD: "Dollars américains ($)", CDF: "Francs congolais (FC)" };

/**
 * Partie principale de l'écran « Encaissement » : monnaie choisie, montant à
 * percevoir (calculé, non modifiable), aide au rendu de monnaie, confirmation.
 */
export function EcranEncaissement({
  acte,
  du,
  taux,
  bloque,
}: {
  acte: { id: string; identifiant: string; titulaire: string };
  du: { montant: number; devise: Devise };
  /** Taux que la base appliquera (dernier saisi), ou null. */
  taux: number | null;
  /** Raison pour laquelle rien ne peut être encaissé (journée clôturée). */
  bloque: string | null;
}) {
  const router = useRouter();
  const [payeEn, setPayeEn] = useState<Devise>(du.devise);
  const [remis, setRemis] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const id = useId();

  const aPercevoir = montantAPercevoir(du, payeEn, taux);
  const monnaie = aPercevoir.ok ? monnaieARendre(remis, aPercevoir.montant, aPercevoir.devise) : { etat: "vide" as const };
  const possible = aPercevoir.ok && !bloque;
  const libelleMontant = aPercevoir.ok ? formaterMontant(aPercevoir.montant, aPercevoir.devise) : "—";

  const choisir = (d: Devise) => {
    setPayeEn(d);
    setRemis("");
    setErreur(null);
  };
  const valider = () =>
    demarrer(async () => {
      if (!aPercevoir.ok) return;
      setErreur(null);
      // En cas de succès, l'action ouvre le reçu
      const r = await encaisser(acte.id, aPercevoir.devise, aPercevoir.montant);
      if (!r.ok) {
        setConfirmation(false);
        setErreur(r.message);
        // Nouveau taux, ou acte parti entre-temps : l'écran est relu
        router.refresh();
      }
    });

  return (
    <section
      aria-label="Encaissement"
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-[26px] rounded-[10px] border border-bordure bg-surface p-5 sm:p-7"
    >
      <div className="flex flex-col gap-1">
        <span className="text-texte-doux">Montant dû selon la grille</span>
        <span className="text-[44px] leading-tight font-bold" data-testid="montant-du">
          {formaterMontant(du.montant, du.devise)}
        </span>
      </div>

      {du.devise === "USD" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-lg font-bold">Le demandeur paie en</legend>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {(["USD", "CDF"] as const).map((d) => (
              <label
                key={d}
                className={`flex h-16 cursor-pointer items-center gap-3 rounded-[10px] px-5 text-xl font-semibold ${
                  payeEn === d ? "border-2 border-bleu-etat bg-bleu-clair text-bleu-etat" : "border border-bordure-champ bg-surface text-encre"
                }`}
              >
                <input type="radio" name={`monnaie-${id}`} checked={payeEn === d} onChange={() => choisir(d)} className="size-5 accent-bleu-etat" />
                {NOMS_MONNAIES[d]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-lg">
          <strong>Paiement en francs congolais</strong> : cet acte est au tarif en francs.
        </p>
      )}

      {aPercevoir.ok ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border-2 border-bleu-etat bg-[#f0f5ff] p-6" data-testid="a-percevoir">
          <span className="text-[17px] font-semibold text-bleu-etat">À percevoir, en espèces</span>
          <span className="text-[44px] leading-tight font-bold text-bleu-etat sm:text-[56px]">{libelleMontant}</span>
          <span className="text-[17px] text-[#374151]">{aPercevoir.calcul}</span>
        </div>
      ) : (
        <p role="alert" className="rounded-[10px] bg-erreur-fond px-5 py-4 font-semibold text-erreur-texte">
          {aPercevoir.message}{" "}
          <Link href="/caissier/taux" className="text-erreur-texte underline">
            Saisir le taux du jour
          </Link>
        </p>
      )}

      {aPercevoir.ok && !bloque && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`remis-${id}`} className="font-semibold">
            Montant remis par l&apos;usager <span className="font-normal text-texte-doux">(facultatif, pour calculer la monnaie)</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <input
                id={`remis-${id}`}
                inputMode="decimal"
                autoComplete="off"
                value={remis}
                onChange={(e) => setRemis(e.target.value)}
                aria-describedby={`monnaie-resultat-${id}`}
                className="h-12 w-full max-w-[220px] min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre"
              />
              <span className="font-semibold text-texte-doux">{aPercevoir.devise === "CDF" ? "FC" : "$"}</span>
            </span>
            <span
              id={`monnaie-resultat-${id}`}
              data-testid="monnaie"
              aria-live="polite"
              className={`text-lg font-bold ${
                monnaie.etat === "rendre" || monnaie.etat === "juste" ? "text-succes-texte" : monnaie.etat === "vide" ? "" : "text-erreur-texte"
              }`}
            >
              {monnaie.etat === "vide" ? "" : monnaie.texte}
            </span>
          </div>
        </div>
      )}

      <p className="text-[15px] text-texte-doux">Le montant est calculé par le logiciel et ne peut pas être modifié. Le reçu portera le taux appliqué.</p>

      {bloque && (
        <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte">
          {bloque}
        </p>
      )}
      {erreur && (
        <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="erreur-encaissement">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-3.5">
        <button
          type="button"
          disabled={!possible}
          onClick={() => {
            setErreur(null);
            setConfirmation(true);
          }}
          className="flex h-[60px] flex-[2_1_320px] items-center justify-center rounded-lg bg-bleu-etat text-[19px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-not-allowed disabled:bg-[#c9d1dd] disabled:text-[#4a5568]"
        >
          Valider l&apos;encaissement
        </button>
        <Link
          href="/caissier"
          className="flex h-[60px] flex-[1_1_160px] items-center justify-center rounded-lg border border-bordure-champ text-[17px] text-encre no-underline hover:bg-bleu-clair"
        >
          Annuler
        </Link>
      </div>

      {confirmation && aPercevoir.ok && (
        <FenetreModale titre="Confirmer l'encaissement" onFermer={() => setConfirmation(false)} bloquee={enCours}>
          <p className="text-lg" data-testid="texte-confirmation">
            Vous avez reçu <strong>{libelleMontant}</strong> en espèces pour l&apos;acte{" "}
            <strong className="font-mono">{acte.identifiant}</strong> ({acte.titulaire}) ?
          </p>
          {monnaie.etat === "rendre" && <p className="font-semibold text-succes-texte">{monnaie.texte}</p>}
          {monnaie.etat === "manque" && <p className="font-semibold text-erreur-texte">Attention : {monnaie.texte.toLowerCase()}</p>}
          <p className="text-[15px] text-texte-doux">
            Le reçu sera numéroté. Il ne pourra plus être effacé, seulement annulé avec un motif avant la clôture de la caisse.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setConfirmation(false)} disabled={enCours} className={classeSecondaire}>
              Corriger
            </button>
            <button
              type="button"
              onClick={valider}
              disabled={enCours}
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Émission du reçu…" : "Oui, émettre le reçu"}
            </button>
          </div>
        </FenetreModale>
      )}
    </section>
  );
}
