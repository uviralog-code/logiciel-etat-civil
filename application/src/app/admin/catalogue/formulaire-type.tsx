"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FenetreModale } from "@/components/fenetre-modale";
import { FAMILLES, type FamilleActe } from "@/lib/charte";
import {
  couleurProposee,
  COULEURS_ACTES,
  MODELES_FICHE,
  nettoyerCode,
  prochainNumero,
  validerNouveauType,
  type ChampCatalogue,
  type ModeleFiche,
  type SaisieTypeActe,
  type TypeActeValide,
} from "@/lib/catalogue";
import { ANNEES_MAXIMUM } from "@/lib/grille-commune";
import { formaterDate, formaterMontant, lendemain, type TypeActe } from "@/lib/tarifs";
import { ajouter } from "./actions";
import { ChoixCouleur } from "./choix-couleur";

const classeChamp =
  "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";
const classePrincipal =
  "h-[52px] rounded-lg bg-bleu-etat px-5 text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75";
const classeSecondaire = "h-[52px] rounded-lg border border-bordure-champ bg-surface px-4 font-semibold text-encre hover:bg-bleu-clair";

function Champ({ id, libelle, aide, children }: { id: string; libelle: string; aide?: ReactNode; children: ReactNode }) {
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
 * « Ajouter un type d'acte » : le type ET son prix, en une seule opération.
 * Le prix entre en vigueur au plus tôt demain : l'acte est disponible à cette date.
 */
export function FormulaireType({ actes, aujourdhui }: { actes: TypeActe[]; aujourdhui: string }) {
  const vide = (): SaisieTypeActe => ({
    numero: String(prochainNumero(actes)), code: "", libelle: "", famille: "attestation", modele: "generique",
    couleur: couleurProposee("attestation", "generique"), distinctEtranger: false,
    montantNational: "", deviseNational: "CDF", montantEtranger: "", deviseEtranger: "CDF", date: "", motif: "",
  });
  const [s, setS] = useState<SaisieTypeActe>(vide);
  const [couleurChoisie, setCouleurChoisie] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; champ?: ChampCatalogue } | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [apercu, setApercu] = useState<TypeActeValide | null>(null);
  const [enCours, demarrer] = useTransition();

  // Le numéro proposé suit le catalogue (après un ajout, il passe au suivant)
  const [numeroPropose, setNumeroPropose] = useState(prochainNumero(actes));
  if (prochainNumero(actes) !== numeroPropose) {
    setNumeroPropose(prochainNumero(actes));
    if (s.numero === String(numeroPropose)) setS({ ...s, numero: String(prochainNumero(actes)) });
  }

  const maj = (champs: Partial<SaisieTypeActe>) => {
    const suivant = { ...s, ...champs };
    // Couleur proposée d'après la famille et la fiche, tant qu'on ne l'a pas choisie soi-même
    if (!couleurChoisie && (champs.famille || champs.modele)) {
      suivant.couleur = couleurProposee(suivant.famille as FamilleActe, suivant.modele as ModeleFiche);
    }
    setS(suivant);
  };
  const enErreur = (c: ChampCatalogue) => (erreur?.champ === c ? true : undefined);
  const premierJour = lendemain(aujourdhui);
  const dernierJour = `${Number(aujourdhui.slice(0, 4)) + ANNEES_MAXIMUM}${aujourdhui.slice(4)}`;

  const verifier = (e: FormEvent) => {
    e.preventDefault();
    setSucces(null);
    const r = validerNouveauType(s, actes, aujourdhui);
    if (!r.ok) return setErreur(r);
    setErreur(null);
    setApercu(r.valeurs);
  };

  const confirmer = () =>
    demarrer(async () => {
      const numeroAjoute = apercu?.numero ?? 0;
      const r = await ajouter(s);
      setApercu(null);
      if (r.ok) {
        setSucces(r.texte);
        setS({ ...vide(), numero: String(Math.max(prochainNumero(actes), numeroAjoute + 1)) });
        setCouleurChoisie(false);
      } else {
        setErreur(r);
      }
    });

  return (
    <form
      id="ajouter-type"
      onSubmit={verifier}
      noValidate
      aria-labelledby="titre-ajout"
      className="flex w-full max-w-[760px] flex-col gap-[18px] rounded-[10px] border border-bordure bg-surface p-6"
    >
      <h2 id="titre-ajout" className="text-xl font-bold">
        Ajouter un type d&apos;acte
      </h2>
      {succes && (
        <p role="status" className="rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte">
          {succes}
        </p>
      )}
      {erreur && (
        <p id="erreur-type" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {erreur.message}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <Champ id="numero" libelle="N° sur la fiche officielle">
          <input id="numero" inputMode="numeric" value={s.numero} onChange={(e) => maj({ numero: e.target.value })} aria-invalid={enErreur("numero")} className={classeChamp} />
        </Champ>
        <Champ id="code" libelle="Code" aide="2 à 6 lettres ; il figurera dans l'ID des actes.">
          <input
            id="code"
            autoComplete="off"
            maxLength={6}
            value={s.code}
            onChange={(e) => maj({ code: nettoyerCode(e.target.value) })}
            aria-invalid={enErreur("code")}
            className={`${classeChamp} font-mono uppercase`}
          />
        </Champ>
      </div>

      <Champ id="libelle-nouveau" libelle="Nom de l'acte">
        <input id="libelle-nouveau" value={s.libelle} onChange={(e) => maj({ libelle: e.target.value })} aria-invalid={enErreur("libelle")} className={classeChamp} />
      </Champ>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Champ id="famille-nouveau" libelle="Famille">
          <select id="famille-nouveau" value={s.famille} onChange={(e) => maj({ famille: e.target.value })} aria-invalid={enErreur("famille")} className={classeChamp}>
            {(Object.keys(FAMILLES) as FamilleActe[]).map((f) => (
              <option key={f} value={f}>
                {FAMILLES[f].libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ id="modele" libelle="Fiche de détails à remplir">
          <select id="modele" value={s.modele} onChange={(e) => maj({ modele: e.target.value })} aria-invalid={enErreur("modele")} className={classeChamp}>
            {(Object.keys(MODELES_FICHE) as ModeleFiche[]).map((m) => (
              <option key={m} value={m}>
                {MODELES_FICHE[m]}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      <ChoixCouleur
        valeur={s.couleur}
        onChange={(c) => {
          setCouleurChoisie(true);
          maj({ couleur: c });
        }}
        nom="couleur-nouveau"
      />

      <fieldset className="flex flex-col gap-4 rounded-lg border border-bordure p-4">
        <legend className="px-1 font-semibold">Prix (grille commune)</legend>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={s.distinctEtranger}
            onChange={(e) => maj({ distinctEtranger: e.target.checked })}
            className="size-5 accent-bleu-etat"
          />
          Les étrangers paient un tarif différent
        </label>
        {(s.distinctEtranger ? (["National", "Etranger"] as const) : (["National"] as const)).map((cat) => (
          <div key={cat} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
            <Champ id={`montant${cat}`} libelle={s.distinctEtranger ? `Tarif ${cat === "National" ? "National" : "Étranger"}` : "Tarif"}>
              <input
                id={`montant${cat}`}
                inputMode="decimal"
                autoComplete="off"
                value={s[`montant${cat}`]}
                onChange={(e) => maj({ [`montant${cat}`]: e.target.value })}
                aria-invalid={enErreur(`montant${cat}`)}
                className={`${classeChamp} text-right`}
              />
            </Champ>
            <Champ id={`devise${cat}`} libelle="Monnaie">
              <select id={`devise${cat}`} value={s[`devise${cat}`]} onChange={(e) => maj({ [`devise${cat}`]: e.target.value })} className={classeChamp}>
                <option value="CDF">FC</option>
                <option value="USD">$</option>
              </select>
            </Champ>
          </div>
        ))}
        <Champ id="date-nouveau" libelle="Disponible à partir du" aide={`Au plus tôt demain, le ${formaterDate(premierJour)} : c'est la date d'entrée en vigueur de son prix.`}>
          <input
            id="date-nouveau"
            type="date"
            min={premierJour}
            max={dernierJour}
            value={s.date}
            onChange={(e) => maj({ date: e.target.value })}
            aria-invalid={enErreur("date")}
            className={classeChamp}
          />
        </Champ>
        <Champ id="motif-nouveau" libelle="Texte de référence">
          <textarea
            id="motif-nouveau"
            rows={2}
            maxLength={300}
            placeholder="Ex. : Arrêté n° … du … sur les tarifs de l'état civil"
            value={s.motif}
            onChange={(e) => maj({ motif: e.target.value })}
            aria-invalid={enErreur("motif")}
            className="w-full rounded-lg border border-bordure-champ bg-surface px-3.5 py-3 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte"
          />
        </Champ>
      </fieldset>

      <button type="submit" className={`${classePrincipal} self-start`}>
        Ajouter au catalogue
      </button>

      {apercu && (
        <FenetreModale titre="Confirmer le nouveau type d'acte" onFermer={() => setApercu(null)} bloquee={enCours}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" data-testid="apercu-type">
            <dt className="text-texte-doux">Acte</dt>
            <dd className="font-semibold">
              {String(apercu.numero).padStart(2, "0")} · {apercu.libelle}
            </dd>
            <dt className="text-texte-doux">Code</dt>
            <dd>
              <span className="rounded-md px-2 py-0.5 font-mono text-[13px] font-semibold text-white" style={{ background: apercu.couleur }}>
                {apercu.code}
              </span>{" "}
              <span className="text-sm text-texte-doux">({COULEURS_ACTES.find((c) => c.valeur === apercu.couleur)?.nom ?? apercu.couleur})</span>
            </dd>
            <dt className="text-texte-doux">Famille</dt>
            <dd>{FAMILLES[apercu.famille].libelle}</dd>
            <dt className="text-texte-doux">Fiche</dt>
            <dd>{MODELES_FICHE[apercu.modele]}</dd>
            <dt className="text-texte-doux">Prix</dt>
            <dd className="font-semibold">
              {apercu.etranger
                ? `National ${formaterMontant(apercu.national.montant, apercu.national.devise)} · Étranger ${formaterMontant(apercu.etranger.montant, apercu.etranger.devise)}`
                : formaterMontant(apercu.national.montant, apercu.national.devise)}
            </dd>
            <dt className="text-texte-doux">Disponible le</dt>
            <dd className="font-semibold">{formaterDate(apercu.date)}</dd>
            <dt className="text-texte-doux">Référence</dt>
            <dd>{apercu.motif}</dd>
          </dl>
          <p className="rounded-lg bg-attention-fond px-3.5 py-2.5 text-[15px] text-attention-texte">
            Vérifiez bien le <strong>code</strong>, le <strong>numéro</strong>, la <strong>fiche</strong> et le choix du{" "}
            <strong>tarif Étrangers</strong> : ils ne pourront plus être modifiés. L&apos;acte ne pourra pas non plus être
            supprimé, seulement retiré du catalogue.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setApercu(null)} disabled={enCours} className={classeSecondaire}>
              Modifier
            </button>
            <button type="button" onClick={confirmer} disabled={enCours} className={classePrincipal}>
              {enCours ? "Ajout…" : "Confirmer l'ajout"}
            </button>
          </div>
        </FenetreModale>
      )}
    </form>
  );
}
