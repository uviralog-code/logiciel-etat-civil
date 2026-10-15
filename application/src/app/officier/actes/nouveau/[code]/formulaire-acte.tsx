"use client";

import Link from "next/link";
import { useId, useState, useTransition, type ReactNode } from "react";
import { FICHES, validerSaisieActe, type ChampActe, type ChampFiche, type SaisieActe, type TypeActePourSaisie } from "@/lib/actes";
import { prixAffiche } from "@/lib/nouvel-acte";
import type { Categorie, Prix } from "@/lib/tarifs";
import { corriger, enregistrer } from "../../actions";

const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classeChoix =
  "flex h-12 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border border-bordure-champ bg-surface px-3.5 whitespace-nowrap has-checked:border-2 has-checked:border-bleu-etat has-checked:bg-bleu-clair";

function Champ({ id, libelle, aide, children }: { id: string; libelle: string; aide?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {libelle}
      </label>
      {children}
      {aide && <span className="text-sm text-texte-doux">{aide}</span>}
    </div>
  );
}

/**
 * Fiche d'un nouvel acte (maquette « Nouvel acte — Fiche ») : les champs du
 * modèle de fiche du type, le demandeur, et le récapitulatif (prix calculé,
 * équivalent en francs, ID prévu). L'enregistrement est fait par la base.
 */
export function FormulaireActe({
  type,
  prix,
  taux,
  idPrevu,
  aujourdhui,
  correction,
}: {
  type: TypeActePourSaisie;
  /** Prix appliqué dans l'entité, par catégorie. */
  prix: Record<Categorie, Prix | null>;
  taux: number | null;
  /** Nouvel acte : l'ID que la base va donner. Correction : l'ID de l'acte. */
  idPrevu: string;
  aujourdhui: string;
  /** Correction d'un acte « enregistré » (renvoyé par le Caissier, ou pas encore transmis). */
  correction?: { acteId: string; initial: SaisieActe };
}) {
  const fiche = FICHES[type.modele_fiche];
  // Identifiants propres à cette fiche : Next garde parfois une fiche précédente cachée dans la page
  const p = useId();
  const id = (cle: string) => `${p}-${cle}`;
  const [s, setS] = useState<SaisieActe>(
    correction?.initial ?? {
      typeActeId: type.id, categorie: "national", titulaire: "", titulaire2: "", demandeur: "", telephone: "", observations: "", details: {},
    },
  );
  const [erreur, setErreur] = useState<{ message: string; champ?: ChampActe } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [action, setAction] = useState<"transmettre" | "garder" | null>(null);

  const maj = (champs: Partial<SaisieActe>) => setS((x) => ({ ...x, ...champs }));
  const majDetail = (cle: string, valeur: string) => setS((x) => ({ ...x, details: { ...x.details, [cle]: valeur } }));
  const enErreur = (c: ChampActe) => (erreur?.champ === c ? true : undefined);
  const decrit = (c: ChampActe) => (erreur?.champ === c ? id("erreur") : undefined);

  const montant = prixAffiche(prix[type.tarif_distinct_etranger ? (s.categorie as Categorie) : "national"] ?? null, taux);

  const envoyer = (transmettre: boolean) => {
    const controle = validerSaisieActe(s, type, aujourdhui);
    if (!controle.ok) {
      setErreur(controle);
      document.getElementById(id(controle.champ ?? ""))?.focus();
      return;
    }
    setErreur(null);
    setAction(transmettre ? "transmettre" : "garder");
    demarrer(async () => {
      const r = correction ? await corriger(correction.acteId, s, transmettre) : await enregistrer(s, transmettre);
      // Réussite : la base a donné l'ID, l'écran de confirmation s'ouvre (redirection)
      if (r && !r.ok) setErreur(r);
    });
  };

  const champFiche = (c: ChampFiche) => {
    const valeur = s.details[c.cle] ?? "";
    if (c.type === "sexe") {
      return (
        <fieldset key={c.cle} className="flex min-w-0 flex-col gap-2" aria-describedby={decrit(c.cle)}>
          <legend className="mb-2 font-semibold">{c.libelle}</legend>
          <div className="flex gap-2.5">
            {(["M", "F"] as const).map((v) => (
              <label key={v} className={classeChoix}>
                <input
                  type="radio"
                  name={c.cle}
                  id={v === "M" ? id(c.cle) : undefined}
                  value={v}
                  checked={valeur === v}
                  onChange={() => majDetail(c.cle, v)}
                  className="size-5 accent-bleu-etat"
                />
                {v === "M" ? "Masculin" : "Féminin"}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    return (
      <Champ key={c.cle} id={id(c.cle)} libelle={c.libelle} aide={c.aide}>
        <input
          id={id(c.cle)}
          type={c.type === "date" ? "date" : "text"}
          inputMode={c.type === "nombre" ? "numeric" : undefined}
          max={c.type === "date" ? aujourdhui : undefined}
          autoComplete="off"
          value={valeur}
          onChange={(e) => majDetail(c.cle, e.target.value)}
          aria-invalid={enErreur(c.cle)}
          aria-describedby={decrit(c.cle)}
          className={classeChamp}
        />
      </Champ>
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-8">
      <form
        id={id("fiche")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          envoyer(true);
        }}
        className="flex min-w-0 flex-[999_1_560px] flex-col gap-6"
      >
        {erreur && (
          <p id={id("erreur")} role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
            {erreur.message}
          </p>
        )}

        <section aria-labelledby={id("titre-titulaire")} className="flex flex-col gap-5 rounded-[10px] border border-bordure bg-surface p-6">
          <h2 id={id("titre-titulaire")} className="text-xl font-bold">
            {fiche.titreTitulaire}
          </h2>
          <Champ id={id("titulaire")} libelle={fiche.libelleTitulaire}>
            <input
              id={id("titulaire")}
              autoComplete="off"
              value={s.titulaire}
              onChange={(e) => maj({ titulaire: e.target.value })}
              aria-invalid={enErreur("titulaire")}
              aria-describedby={decrit("titulaire")}
              className={classeChamp}
            />
          </Champ>
          {fiche.libelleTitulaire2 && (
            <Champ id={id("titulaire2")} libelle={fiche.libelleTitulaire2}>
              <input
                id={id("titulaire2")}
                autoComplete="off"
                value={s.titulaire2}
                onChange={(e) => maj({ titulaire2: e.target.value })}
                aria-invalid={enErreur("titulaire2")}
                aria-describedby={decrit("titulaire2")}
                className={classeChamp}
              />
            </Champ>
          )}
          {fiche.champs.length > 0 && (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">{fiche.champs.slice(0, 3).map(champFiche)}</div>
          )}
          {fiche.champs.length > 3 && <div className="grid grid-cols-1 gap-5 md:grid-cols-2">{fiche.champs.slice(3).map(champFiche)}</div>}
        </section>

        <section aria-labelledby={id("titre-demandeur")} className="flex flex-col gap-5 rounded-[10px] border border-bordure bg-surface p-6">
          <h2 id={id("titre-demandeur")} className="text-xl font-bold">
            La personne qui fait la demande
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Champ id={id("demandeur")} libelle="Nom du demandeur" aide="Si c'est le titulaire lui-même, laissez vide.">
              <input
                id={id("demandeur")}
                autoComplete="off"
                value={s.demandeur}
                onChange={(e) => maj({ demandeur: e.target.value })}
                aria-invalid={enErreur("demandeur")}
                aria-describedby={decrit("demandeur")}
                className={classeChamp}
              />
            </Champ>
            <Champ id={id("telephone")} libelle="Téléphone">
              <input
                id={id("telephone")}
                type="tel"
                autoComplete="off"
                placeholder="+243 …"
                value={s.telephone}
                onChange={(e) => maj({ telephone: e.target.value })}
                aria-invalid={enErreur("telephone")}
                aria-describedby={decrit("telephone")}
                className={classeChamp}
              />
            </Champ>
          </div>
          <fieldset className="flex flex-col gap-2" aria-describedby={id("aide-categorie")}>
            <legend className="mb-2 font-semibold">Nationalité du demandeur</legend>
            <div className="flex flex-wrap gap-2.5">
              {(["national", "etranger"] as const).map((c) => (
                <label key={c} className={`${classeChoix} flex-none`}>
                  <input
                    type="radio"
                    name="categorie"
                    value={c}
                    checked={s.categorie === c}
                    onChange={() => maj({ categorie: c })}
                    className="size-5 accent-bleu-etat"
                  />
                  {c === "national" ? "Congolaise (national)" : "Étrangère"}
                </label>
              ))}
            </div>
            <span id={id("aide-categorie")} className="text-sm text-texte-doux">
              {type.tarif_distinct_etranger
                ? "Pour cet acte, les étrangers paient un tarif différent."
                : "Pour cet acte, le tarif est le même pour tous."}
            </span>
          </fieldset>
          <Champ id={id("observations")} libelle="Observations (facultatif)">
            <textarea
              id={id("observations")}
              rows={3}
              maxLength={500}
              value={s.observations}
              onChange={(e) => maj({ observations: e.target.value })}
              aria-invalid={enErreur("observations")}
              className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
            />
          </Champ>
        </section>
      </form>

      <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
        <section aria-labelledby={id("titre-recap")} className="flex flex-col gap-[18px] rounded-[10px] border border-bordure bg-surface p-6">
          <h2 id={id("titre-recap")} className="text-xl font-bold">
            Récapitulatif
          </h2>
          <div className="flex flex-col gap-1" data-testid="montant">
            <span className="text-[15px] text-texte-doux">Montant à payer (grille en vigueur)</span>
            <span className="text-[40px] leading-tight font-bold">{montant?.montant ?? "—"}</span>
            {montant?.equivalent && <span className="text-[#374151]">{montant.equivalent}</span>}
          </div>
          <div className="flex flex-col gap-1 border-t border-[#edf0f5] pt-4">
            <span className="text-[15px] text-texte-doux">{correction ? "ID de l'acte (il ne change pas)" : "ID attribué à l'enregistrement"}</span>
            <span className="font-mono text-lg font-semibold" data-testid="id-prevu">
              {idPrevu}
            </span>
          </div>
          <p className="text-sm text-texte-doux">Le prix est calculé par le logiciel. Il ne peut pas être modifié ici.</p>
        </section>
        <button
          type="submit"
          form={id("fiche")}
          disabled={enCours}
          className="h-14 rounded-lg bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
        >
          {enCours && action === "transmettre"
            ? "Enregistrement…"
            : correction
              ? "Corriger et transmettre au Caissier"
              : "Enregistrer et transmettre au Caissier"}
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => envoyer(false)}
          className="h-[52px] rounded-lg border border-bleu-etat bg-surface text-[17px] font-bold text-bleu-etat hover:bg-bleu-clair disabled:cursor-wait disabled:opacity-75"
        >
          {enCours && action === "garder" ? "Enregistrement…" : correction ? "Corriger sans transmettre" : "Enregistrer sans transmettre"}
        </button>
        <Link href="/officier" className="self-center">
          {correction ? "Abandonner la correction" : "Abandonner cette saisie"}
        </Link>
      </aside>
    </div>
  );
}
