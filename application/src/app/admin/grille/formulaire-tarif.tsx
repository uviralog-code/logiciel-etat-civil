"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import type { Devise } from "@/lib/charte";
import type { Entite } from "@/lib/comptes";
import {
  ANNEES_MAXIMUM,
  apercuChangement,
  LIBELLE_CATEGORIE,
  libelleActe,
  MESSAGES_GRILLE,
  validerSaisie,
  type Apercu,
  type ChampTarif,
  type SaisieTarif,
  type TarifValide,
} from "@/lib/grille-commune";
import { formaterDate, formaterMontant, lendemain, memePrix, type Categorie, type DonneesTarifaires } from "@/lib/tarifs";
import { programmer } from "./actions";

const classeChamp =
  "h-12 w-full rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classePrincipal =
  "h-[52px] rounded-lg bg-bleu-etat px-4 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75";
const classeSecondaire = "h-[52px] rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

/**
 * « Programmer un nouveau tarif commun » (maquette « Admin — Grille commune »).
 * Avant d'enregistrer, un aperçu montre l'ancien et le nouveau prix, la date
 * d'effet et les entités qui garderont leur propre prix.
 */
export function FormulaireTarif({
  donnees,
  entites,
  aujourdhui,
}: {
  donnees: DonneesTarifaires;
  entites: Entite[];
  aujourdhui: string;
}) {
  const actes = donnees.actes.filter((a) => a.actif).sort((a, b) => a.numero - b.numero);
  const [acteId, setActeId] = useState(actes[0]?.id ?? "");
  const [categorie, setCategorie] = useState<Categorie>("national");
  const [montant, setMontant] = useState("");
  const [deviseChoisie, setDeviseChoisie] = useState<Devise | null>(null); // vide : celle du tarif actuel
  const [date, setDate] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<{ message: string; champ?: ChampTarif } | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ valeurs: TarifValide; apercu: Apercu; saisie: SaisieTarif } | null>(null);
  const [enCours, demarrer] = useTransition();

  const acte = actes.find((a) => a.id === acteId) ?? actes[0];
  const categorieEffective: Categorie = acte?.tarif_distinct_etranger ? categorie : "national";
  const actuel = donnees.communs
    .filter((c) => c.type_acte_id === acte?.id && c.categorie === categorieEffective && c.en_vigueur_depuis <= aujourdhui)
    .sort((a, b) => b.en_vigueur_depuis.localeCompare(a.en_vigueur_depuis))[0];
  const devise: Devise = deviseChoisie ?? actuel?.devise ?? "CDF";
  const premierJour = lendemain(aujourdhui);
  const dernierJour = `${Number(aujourdhui.slice(0, 4)) + ANNEES_MAXIMUM}${aujourdhui.slice(4)}`;

  if (!acte) {
    return (
      <section className="flex flex-[1_1_380px] flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-6">
        <h2 className="text-xl font-bold">Programmer un nouveau tarif commun</h2>
        <p>Le catalogue ne contient aucun acte actif.</p>
      </section>
    );
  }

  const enErreur = (c: ChampTarif) => (erreur?.champ === c ? true : undefined);
  const decrit = (c: ChampTarif) => (erreur?.champ === c ? "erreur-tarif" : undefined);

  const verifier = (e: FormEvent) => {
    e.preventDefault();
    setSucces(null);
    const saisie: SaisieTarif = { acteId: acte.id, categorie: categorieEffective, montant, devise, date, motif };
    const controle = validerSaisie(saisie, actes, aujourdhui);
    if (!controle.ok) return setErreur(controle);
    const a = apercuChangement(controle.valeurs, donnees, entites, aujourdhui);
    if (a.doublon) return setErreur({ message: MESSAGES_GRILLE.doublon, champ: "date" });
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
      id="programmer-tarif"
      onSubmit={verifier}
      noValidate
      aria-labelledby="titre-programmer"
      className="flex flex-[1_1_380px] flex-col gap-[18px] self-start rounded-[10px] border border-bordure bg-surface p-6"
    >
      <h2 id="titre-programmer" className="text-xl font-bold">
        Programmer un nouveau tarif commun
      </h2>

      {succes && (
        <p role="status" className="rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          Tarif programmé — {succes}
        </p>
      )}
      {erreur && (
        <p id="erreur-tarif" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
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
        <span className="text-sm text-texte-doux" data-testid="prix-actuel">
          Prix actuel{acte.tarif_distinct_etranger ? ` (${LIBELLE_CATEGORIE[categorieEffective]})` : ""} :{" "}
          {actuel ? formaterMontant(actuel.montant, actuel.devise) : "aucun"}
        </span>
      </div>

      {acte.tarif_distinct_etranger && (
        <fieldset className="flex flex-col gap-2" aria-describedby={decrit("categorie")}>
          <legend className="mb-2 font-semibold">Catégorie</legend>
          <div className="flex gap-3">
            {(["national", "etranger"] as const).map((c) => (
              <label
                key={c}
                className="flex h-12 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border border-bordure-champ px-3.5 has-checked:border-2 has-checked:border-bleu-etat has-checked:bg-bleu-clair"
              >
                <input
                  type="radio"
                  name="categorie"
                  value={c}
                  checked={categorieEffective === c}
                  onChange={() => {
                    setCategorie(c);
                    setDeviseChoisie(null);
                  }}
                  className="size-5 accent-bleu-etat"
                />
                {LIBELLE_CATEGORIE[c]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2">
          <label htmlFor="devise" className="font-semibold">
            Monnaie
          </label>
          <select
            id="devise"
            value={devise}
            onChange={(e) => setDeviseChoisie(e.target.value as Devise)}
            aria-invalid={enErreur("devise")}
            className={classeChamp}
          >
            <option value="USD">$</option>
            <option value="CDF">FC</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="date" className="font-semibold">
          En vigueur à partir du
        </label>
        <input
          id="date"
          type="date"
          min={premierJour}
          max={dernierJour}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={enErreur("date")}
          aria-describedby={erreur?.champ === "date" ? "erreur-tarif aide-date" : "aide-date"}
          className={classeChamp}
        />
        <span id="aide-date" className="text-sm text-texte-doux">
          Au plus tôt demain, le {formaterDate(premierJour)} : un prix ne change jamais en cours de journée.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="motif" className="font-semibold">
          Texte de référence
        </label>
        <textarea
          id="motif"
          rows={3}
          maxLength={300}
          placeholder="Ex. : Arrêté n° … du … sur les tarifs de l'état civil"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          aria-invalid={enErreur("motif")}
          aria-describedby={decrit("motif")}
          className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
        />
      </div>

      <button type="submit" className={classePrincipal}>
        Programmer pour les 4 entités
      </button>
      <p className="text-sm leading-[1.45] text-texte-doux">
        Les actes enregistrés avant cette date gardent l&apos;ancien prix. Une entité qui a ajusté ce tarif garde son
        ajustement jusqu&apos;à ce qu&apos;elle revienne à la grille commune.
      </p>

      {apercu && (
        <FenetreModale titre="Confirmer le nouveau tarif" onFermer={() => setApercu(null)} bloquee={enCours}>
          <Resume valeurs={apercu.valeurs} apercu={apercu.apercu} />
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

/** Contenu de la fenêtre de confirmation. */
function Resume({ valeurs, apercu }: { valeurs: TarifValide; apercu: Apercu }) {
  const nouveau = formaterMontant(valeurs.montant, valeurs.devise);
  const avant = apercu.veille ? formaterMontant(apercu.veille.montant, apercu.veille.devise) : "aucun prix";
  return (
    <div className="flex flex-col gap-3.5" data-testid="apercu-tarif">
      <p className="font-semibold">
        {libelleActe(valeurs.acte)}
        {valeurs.acte.tarif_distinct_etranger && ` · ${LIBELLE_CATEGORIE[valeurs.categorie]}`}
      </p>
      <p className="flex flex-wrap items-baseline gap-3 rounded-lg border border-[#c5d4ee] bg-[#f0f5ff] px-4 py-3">
        <span className="text-xl text-texte-doux line-through decoration-1">{avant}</span>
        <span aria-hidden="true" className="text-xl">→</span>
        <span className="text-2xl font-bold text-bleu-etat">{nouveau}</span>
        <span className="w-full text-[15px]">
          à partir du <strong>{formaterDate(valeurs.date)}</strong>
        </span>
      </p>
      {apercu.veille && apercu.actuel && !memePrix(apercu.veille, apercu.actuel) && (
        <p className="text-[15px]">
          Prix d&apos;aujourd&apos;hui : {formaterMontant(apercu.actuel.montant, apercu.actuel.devise)}. Un autre changement
          ({avant}) est déjà programmé avant cette date.
        </p>
      )}
      {apercu.identique && (
        <p className="rounded-lg bg-attention-fond px-3.5 py-2.5 text-[15px] font-semibold text-attention-texte">
          C&apos;est le même prix que la veille : ce changement ne modifiera rien.
        </p>
      )}
      {apercu.entitesAjustees.length > 0 ? (
        <p className="rounded-lg bg-attention-fond px-3.5 py-2.5 text-[15px] text-attention-texte">
          <strong>Gardent leur propre prix à cette date :</strong>{" "}
          {apercu.entitesAjustees.map((e) => `${e.code} (${formaterMontant(e.prix.montant, e.prix.devise)})`).join(", ")}.
          Le nouveau tarif s&apos;appliquera aux autres entités.
        </p>
      ) : (
        <p className="text-[15px]">S&apos;applique aux 4 entités.</p>
      )}
      <p className="text-[15px] text-texte-doux">
        Texte de référence : <span className="text-encre">{valeurs.motif}</span>
      </p>
    </div>
  );
}
