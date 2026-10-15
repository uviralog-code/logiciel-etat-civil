"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import type { Devise } from "@/lib/charte";
import { nomCourt, type Entite } from "@/lib/comptes";
import { ANNEES_MAXIMUM, LIBELLE_CATEGORIE, libelleActe, type ChampTarif } from "@/lib/grille-commune";
import {
  apercuAjustement,
  MESSAGES_ENTITE,
  validerAjustement,
  type AjustementValide,
  type ApercuAjustement,
  type ModeAjustement,
  type SaisieAjustement,
} from "@/lib/tarifs-entite";
import {
  formaterDate,
  formaterMontant,
  lendemain,
  prixApplicable,
  type Categorie,
  type DonneesTarifaires,
  type PrixApplique,
} from "@/lib/tarifs";
import { programmer } from "./actions";

const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classePrincipal =
  "h-[52px] rounded-lg bg-bleu-etat px-4 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75";
const classeContour =
  "h-12 rounded-lg border border-bleu-etat bg-surface px-4 font-bold text-bleu-etat hover:bg-bleu-clair disabled:cursor-wait disabled:opacity-75";
const classeSecondaire = "h-[52px] rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

const prixTexte = (p: PrixApplique | null) =>
  p ? `${formaterMontant(p.montant, p.devise)}${p.source === "commune" ? " (grille commune)" : ""}` : "aucun prix";

/**
 * « Ajuster un tarif » (maquette « Officier — Tarifs de l'entité ») : programmer
 * un prix propre à l'entité, ou revenir à la grille commune, à partir d'une date.
 * Un aperçu montre le prix d'avant et d'après avant d'enregistrer.
 */
export function FormulaireAjustement({
  donnees,
  entite,
  aujourdhui,
}: {
  donnees: DonneesTarifaires;
  entite: Entite;
  aujourdhui: string;
}) {
  const actes = donnees.actes.filter((a) => a.actif).sort((a, b) => a.numero - b.numero);
  const [acteId, setActeId] = useState(actes[0]?.id ?? "");
  const [categorie, setCategorie] = useState<Categorie>("national");
  const [montant, setMontant] = useState("");
  const [deviseChoisie, setDeviseChoisie] = useState<Devise | null>(null);
  const [date, setDate] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<{ message: string; champ?: ChampTarif } | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ valeurs: AjustementValide; apercu: ApercuAjustement; saisie: SaisieAjustement } | null>(null);
  const [enCours, demarrer] = useTransition();

  const acte = actes.find((a) => a.id === acteId) ?? actes[0];
  if (!acte) return null;
  const categorieEffective: Categorie = acte.tarif_distinct_etranger ? categorie : "national";
  const siens = donnees.ajustements.filter((a) => a.entite_id === entite.id);
  const applique = prixApplicable(acte, categorieEffective, donnees.communs, siens, aujourdhui);
  const devise: Devise = deviseChoisie ?? applique?.devise ?? "CDF";
  const premierJour = lendemain(aujourdhui);
  const dernierJour = `${Number(aujourdhui.slice(0, 4)) + ANNEES_MAXIMUM}${aujourdhui.slice(4)}`;
  const lieu = nomCourt(entite.nom);

  const enErreur = (c: ChampTarif) => (erreur?.champ === c ? true : undefined);
  const decrit = (c: ChampTarif) => (erreur?.champ === c ? "erreur-ajustement" : undefined);

  const verifier = (mode: ModeAjustement) => {
    setSucces(null);
    const saisie: SaisieAjustement = { mode, acteId: acte.id, categorie: categorieEffective, montant, devise, date, motif };
    const controle = validerAjustement(saisie, actes, aujourdhui);
    if (!controle.ok) return setErreur(controle);
    const a = apercuAjustement(controle.valeurs, donnees, entite.id);
    if (a.doublon) return setErreur({ message: MESSAGES_ENTITE.doublon, champ: "date" });
    if (a.dejaSurGrille) return setErreur({ message: MESSAGES_ENTITE.dejaSurGrille, champ: "date" });
    setErreur(null);
    setApercu({ valeurs: controle.valeurs, apercu: a, saisie });
  };

  const confirmer = () =>
    demarrer(async () => {
      if (!apercu) return;
      const r = await programmer(apercu.saisie);
      setApercu(null);
      if (r.ok) {
        setSucces(r.texte);
        setMontant("");
        setDate("");
        setMotif("");
        setDeviseChoisie(null);
      } else {
        setErreur(r);
      }
    });

  return (
    <form
      id="ajuster-tarif"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        verifier("prix");
      }}
      noValidate
      aria-labelledby="titre-ajuster"
      className="flex min-w-0 flex-[1_1_360px] flex-col gap-[18px] self-start rounded-[10px] border border-bordure bg-surface p-6"
    >
      <h2 id="titre-ajuster" className="text-xl font-bold">
        Ajuster un tarif
      </h2>

      {succes && (
        <p role="status" className="rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          Enregistré — {succes}
        </p>
      )}
      {erreur && (
        <p id="erreur-ajustement" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {erreur.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="acte" className="font-semibold">
          Acte
        </label>
        <select
          id="acte"
          value={acte.id}
          onChange={(e) => {
            setActeId(e.target.value);
            setDeviseChoisie(null);
          }}
          aria-invalid={enErreur("acte")}
          aria-describedby={decrit("acte")}
          className={classeChamp}
        >
          {actes.map((a) => (
            <option key={a.id} value={a.id}>
              {libelleActe(a)}
            </option>
          ))}
        </select>
      </div>

      {acte.tarif_distinct_etranger && (
        <div className="flex flex-col gap-2">
          <label htmlFor="categorie" className="font-semibold">
            Catégorie
          </label>
          <select
            id="categorie"
            value={categorieEffective}
            onChange={(e) => {
              setCategorie(e.target.value as Categorie);
              setDeviseChoisie(null);
            }}
            aria-invalid={enErreur("categorie")}
            className={classeChamp}
          >
            <option value="national">{LIBELLE_CATEGORIE.national}</option>
            <option value="etranger">{LIBELLE_CATEGORIE.etranger}</option>
          </select>
        </div>
      )}

      <p className="-mt-2 text-sm text-texte-doux" data-testid="prix-applique">
        Prix appliqué aujourd&apos;hui à {lieu} : <strong className="text-encre">{prixTexte(applique)}</strong>
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="montant" className="font-semibold">
            Nouveau montant
          </label>
          <input
            id="montant"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            aria-invalid={enErreur("montant")}
            aria-describedby={decrit("montant")}
            className={`${classeChamp} text-right`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="devise" className="font-semibold">
            Monnaie
          </label>
          <select id="devise" value={devise} onChange={(e) => setDeviseChoisie(e.target.value as Devise)} className={classeChamp}>
            <option value="CDF">FC</option>
            <option value="USD">$</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="date" className="font-semibold">
          À partir du
        </label>
        <input
          id="date"
          type="date"
          min={premierJour}
          max={dernierJour}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={enErreur("date")}
          aria-describedby={erreur?.champ === "date" ? "erreur-ajustement aide-date" : "aide-date"}
          className={classeChamp}
        />
        <span id="aide-date" className="text-sm text-texte-doux">
          Au plus tôt demain, le {formaterDate(premierJour)} : un prix ne change jamais en cours de journée.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="motif" className="font-semibold">
          Motif (décision de l&apos;autorité)
        </label>
        <textarea
          id="motif"
          rows={3}
          maxLength={300}
          placeholder="Ex. : Décision du Bourgmestre n° …"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          aria-invalid={enErreur("motif")}
          aria-describedby={decrit("motif")}
          className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
        />
      </div>

      <button type="submit" className={classePrincipal}>
        Programmer l&apos;ajustement
      </button>
      <button type="button" onClick={() => verifier("grille")} className={classeContour}>
        Revenir à la grille commune
      </button>
      <p className="text-sm leading-[1.45] text-texte-doux">
        Un tarif déjà en vigueur ne se modifie pas : on programme le nouveau à partir d&apos;une date. Seul un changement
        encore à venir peut être corrigé (liste « Ajustements programmés »).
      </p>

      {apercu && (
        <FenetreModale
          titre={apercu.valeurs.mode === "prix" ? "Confirmer l'ajustement" : "Confirmer le retour à la grille commune"}
          onFermer={() => setApercu(null)}
          bloquee={enCours}
        >
          <div className="flex flex-col gap-3.5" data-testid="apercu-ajustement">
            <p className="font-semibold">
              {libelleActe(apercu.valeurs.acte)}
              {apercu.valeurs.acte.tarif_distinct_etranger && ` · ${LIBELLE_CATEGORIE[apercu.valeurs.categorie]}`}
            </p>
            <p className="flex flex-wrap items-baseline gap-3 rounded-lg border border-[#c5d4ee] bg-[#f0f5ff] px-4 py-3">
              <span className="text-xl text-texte-doux line-through decoration-1">{prixTexte(apercu.apercu.avant)}</span>
              <span aria-hidden="true" className="text-xl">→</span>
              <span className="text-2xl font-bold text-bleu-etat">{prixTexte(apercu.apercu.apres)}</span>
              <span className="w-full text-[15px]">
                à {lieu}, à partir du <strong>{formaterDate(apercu.valeurs.date)}</strong>
              </span>
            </p>
            {apercu.apercu.sansEffet && (
              <p className="rounded-lg bg-attention-fond px-3.5 py-2.5 text-[15px] font-semibold text-attention-texte">
                C&apos;est le même prix que la veille : ce changement ne modifiera rien.
              </p>
            )}
            <p className="text-[15px]">Seule {lieu} est concernée. L&apos;administrateur verra ce changement dans la grille commune.</p>
            <p className="text-[15px] text-texte-doux">
              Motif : <span className="text-encre">{apercu.valeurs.motif}</span>
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setApercu(null)} disabled={enCours} className={classeSecondaire}>
              Modifier
            </button>
            <button type="button" onClick={confirmer} disabled={enCours} className={classePrincipal}>
              {enCours ? "Enregistrement…" : "Confirmer"}
            </button>
          </div>
        </FenetreModale>
      )}
    </form>
  );
}
