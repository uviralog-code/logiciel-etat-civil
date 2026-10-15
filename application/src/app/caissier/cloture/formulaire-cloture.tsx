"use client";

import { useId, useState, useTransition } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import type { Devise } from "@/lib/charte";
import { BILLETS, ecart, lireCompte, totalBillets, type ResultatCloture } from "@/lib/cloture";
import { formaterMontant } from "@/lib/tarifs";
import { cloturer } from "../actions";

const sep = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const NOMS: Record<Devise, string> = { CDF: "Francs congolais", USD: "Dollars américains" };

/**
 * Clôture de la caisse (maquette) : aide au comptage billet par billet,
 * attendu / compté / écart, explication obligatoire en cas d'écart, confirmation.
 */
export function FormulaireCloture({ attenduUsd, attenduCdf, dateCourte }: { attenduUsd: number; attenduCdf: number; dateCourte: string }) {
  const id = useId();
  const [billets, setBillets] = useState<Record<Devise, Record<number, string>>>({ CDF: {}, USD: {} });
  const [compte, setCompte] = useState<Record<Devise, string>>({ CDF: "", USD: "" });
  const [explication, setExplication] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [erreur, setErreur] = useState<Extract<ResultatCloture, { ok: false }> | null>(null);
  const [enCours, demarrer] = useTransition();

  const attendu: Record<Devise, number> = { USD: attenduUsd, CDF: attenduCdf };
  const montantCompte = (d: Devise) => (compte[d].trim() ? lireCompte(compte[d], d) : null);
  const ecarts = (["USD", "CDF"] as const).map((d) => {
    const m = montantCompte(d);
    return m == null ? null : ecart(m, attendu[d], d);
  });
  const avecEcart = ecarts.some((e) => e && e.etat !== "juste");

  // L'aide au comptage remplit le « compté en caisse »
  const changerBillet = (d: Devise, valeur: number, nombre: string) => {
    const suivants = { ...billets[d], [valeur]: nombre };
    setBillets({ ...billets, [d]: suivants });
    const total = totalBillets(suivants, d);
    if (total != null) setCompte((c) => ({ ...c, [d]: sep(total) }));
    setErreur(null);
  };

  const ouvrirConfirmation = () => {
    setErreur(null);
    if (montantCompte("USD") == null) return setErreur({ ok: false, message: "Indiquez les dollars comptés en caisse (0 s'il n'y en a pas).", champ: "usd" });
    if (montantCompte("CDF") == null) return setErreur({ ok: false, message: "Indiquez les francs comptés en caisse, sans centimes (0 s'il n'y en a pas).", champ: "cdf" });
    if (avecEcart && explication.trim().length < 5) {
      return setErreur({ ok: false, message: "Il y a un écart : expliquez-le (5 caractères au moins). L'explication est transmise à l'administrateur.", champ: "explication" });
    }
    setConfirmation(true);
  };
  const envoyer = () =>
    demarrer(async () => {
      // En cas de succès, l'action affiche la clôture faite
      const r = await cloturer({ compteUsd: compte.USD, compteCdf: compte.CDF, explication, attenduUsd, attenduCdf });
      if (!r.ok) {
        setConfirmation(false);
        setErreur(r);
      }
    });

  const aide = (d: Devise) => {
    const total = totalBillets(billets[d], d);
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid={`aide-${d}`}>
        <h3 className="font-bold">{NOMS[d]}</h3>
        <div className="flex flex-col gap-1.5">
          {BILLETS[d].map((valeur) => {
            const n = (billets[d][valeur] ?? "").trim();
            return (
              <div key={valeur} className="grid grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)] items-center gap-3">
                <label htmlFor={`${id}-${d}-${valeur}`} className="text-[15px]">
                  Billets de {formaterMontant(valeur, d)}
                </label>
                <input
                  id={`${id}-${d}-${valeur}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={billets[d][valeur] ?? ""}
                  onChange={(e) => changerBillet(d, valeur, e.target.value)}
                  className="h-10 w-full rounded-lg border border-bordure-champ bg-surface px-2.5 text-right text-[17px]"
                />
                <span className="text-right text-[15px] text-texte-doux">{/^\d+$/.test(n) ? formaterMontant(valeur * Number(n), d) : ""}</span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between border-t border-bordure pt-2 font-bold">
          <span>Total compté</span>
          <span data-testid={`total-${d}`}>{total == null ? "—" : formaterMontant(total, d)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={`${id}-aide`} className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-aide`} className="text-xl font-bold">
            Aide au comptage
          </h2>
          <p className="text-texte-doux">Indiquez le nombre de billets de chaque valeur : le logiciel fait l&apos;addition et remplit le « compté en caisse ».</p>
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {aide("CDF")}
          {aide("USD")}
        </div>
      </section>

      <section aria-label="Comparaison attendu / compté" className="flex flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-5 sm:p-6">
        <div className="hidden grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase sm:grid">
          <span>Monnaie</span>
          <span>Attendu (calculé)</span>
          <span>Compté en caisse</span>
          <span>Écart</span>
        </div>
        {(["USD", "CDF"] as const).map((d, i) => {
          const e = ecarts[i];
          return (
            <div key={d} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 border-t border-[#edf0f5] pt-3 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]" data-ligne-cloture={d}>
              <span className="font-bold">{d === "USD" ? "Dollars" : "Francs"}</span>
              <span className="text-lg" data-testid={`attendu-${d}`}>
                <span className="text-texte-doux sm:hidden">Attendu : </span>
                {formaterMontant(attendu[d], d)}
              </span>
              <span className="flex items-center gap-2">
                <input
                  aria-label={d === "USD" ? "Dollars comptés" : "Francs comptés"}
                  inputMode="decimal"
                  autoComplete="off"
                  value={compte[d]}
                  onChange={(ev) => {
                    setCompte({ ...compte, [d]: ev.target.value });
                    setErreur(null);
                  }}
                  aria-invalid={erreur?.champ === (d === "USD" ? "usd" : "cdf") ? true : undefined}
                  className="h-12 w-full max-w-[200px] rounded-lg border border-bordure-champ bg-surface px-3 text-right text-lg aria-invalid:border-2 aria-invalid:border-erreur-texte"
                />
                <span className="font-semibold text-texte-doux">{d === "USD" ? "$" : "FC"}</span>
              </span>
              <span
                data-testid={`ecart-${d}`}
                className={`text-lg font-bold ${!e ? "text-texte-doux" : e.etat === "juste" ? "text-succes-texte" : "text-erreur-texte"}`}
              >
                {e ? e.texte : "—"}
              </span>
            </div>
          );
        })}

        {avecEcart && (
          <div className="flex flex-col gap-2 rounded-lg bg-attention-fond p-4">
            <label htmlFor={`${id}-explication`} className="font-bold text-attention-texte">
              Expliquez l&apos;écart (obligatoire)
            </label>
            <textarea
              id={`${id}-explication`}
              rows={2}
              maxLength={500}
              value={explication}
              placeholder="Ex. : billet de 5 000 FC rendu par erreur à un usager vers 11 h."
              onChange={(e) => {
                setExplication(e.target.value);
                if (erreur?.champ === "explication") setErreur(null);
              }}
              aria-invalid={erreur?.champ === "explication" ? true : undefined}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
            <span className="text-[15px] text-attention-texte">L&apos;écart et son explication sont transmis à l&apos;administrateur.</span>
          </div>
        )}

        {erreur && (
          <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-semibold text-erreur-texte" data-testid="erreur-cloture">
            {erreur.message}
          </p>
        )}

        <div className="flex flex-col gap-1 rounded-lg border border-[#e8a3a3] bg-erreur-fond p-4 text-erreur-texte">
          <strong>Après la clôture, la journée est verrouillée</strong>
          <span>
            Plus aucun encaissement, exonération ni annulation de reçu pour le {dateCourte}, même par l&apos;administrateur. Un usager qui se présente ensuite
            paiera demain.
          </span>
        </div>

        <button
          type="button"
          onClick={ouvrirConfirmation}
          className="flex h-[60px] items-center justify-center rounded-lg bg-bleu-etat px-6 text-[19px] font-bold text-white hover:bg-bleu-etat-fonce"
        >
          Clôturer la journée du {dateCourte}
        </button>
      </section>

      {confirmation && (
        <FenetreModale titre={`Clôturer la journée du ${dateCourte} ?`} onFermer={() => setConfirmation(false)} bloquee={enCours}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[17px]" data-testid="resume-cloture">
            <dt className="text-texte-doux">Dollars comptés</dt>
            <dd className="font-bold">{formaterMontant(montantCompte("USD") ?? 0, "USD")}</dd>
            <dt className="text-texte-doux">Francs comptés</dt>
            <dd className="font-bold">{formaterMontant(montantCompte("CDF") ?? 0, "CDF")}</dd>
            <dt className="text-texte-doux">Écarts</dt>
            <dd className={`font-bold ${avecEcart ? "text-erreur-texte" : "text-succes-texte"}`}>
              {ecarts.map((e) => e?.texte).join(" ; ")}
            </dd>
          </dl>
          <p className="text-[15px] text-texte-doux">La clôture est définitive : la journée ne pourra plus être modifiée.</p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmation(false)}
              disabled={enCours}
              className="h-12 rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair"
            >
              Recompter
            </button>
            <button
              type="button"
              onClick={envoyer}
              disabled={enCours}
              className="h-12 rounded-lg bg-bleu-etat px-4 font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
            >
              {enCours ? "Clôture…" : "Oui, clôturer"}
            </button>
          </div>
        </FenetreModale>
      )}
    </div>
  );
}
