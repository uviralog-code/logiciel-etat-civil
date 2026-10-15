"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { SaisieCode } from "@/components/saisie-code";
import { decrireNavigateur } from "@/lib/connexion";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";
import { cleLisible, commencerMiseEnPlace, EMETTEUR, verifierCode, type MiseEnPlace } from "@/lib/verification";

interface Etat {
  message: string | null;
  reconnexion?: boolean;
  recommencer?: boolean;
  tentative: number;
}
const ETAT_INITIAL: Etat = { message: null, tentative: 0 };

const classeBouton =
  "flex h-[52px] items-center justify-center rounded-lg bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75";

export function FormulaireVerification({
  mode,
  nomUtilisateur,
  administrateur,
  destination,
}: {
  /** « mise-en-place » : aucun téléphone n'est encore relié ; « verification » : connexions suivantes. */
  mode: "mise-en-place" | "verification";
  nomUtilisateur: string;
  administrateur: boolean;
  destination: string;
}) {
  const routeur = useRouter();
  const premiereCase = useRef<HTMLInputElement>(null);
  const [miseEnPlace, setMiseEnPlace] = useState<MiseEnPlace | null>(null);
  const [erreurPreparation, setErreurPreparation] = useState<string | null>(null);
  const [preparation, demarrerPreparation] = useTransition();

  const [etat, verifier, enCours] = useActionState(async (precedent: Etat, donnees: FormData): Promise<Etat> => {
    const resultat = await verifierCode(
      creerClientNavigateur(),
      { code: String(donnees.get("code") ?? ""), idFacteur: miseEnPlace?.idFacteur },
      { nomUtilisateur, navigateur: decrireNavigateur(navigator.userAgent) },
    );
    if (resultat.ok) {
      routeur.replace(destination);
      return { ...precedent, message: null };
    }
    return { ...resultat, tentative: precedent.tentative + 1 };
  }, ETAT_INITIAL);

  // Après une erreur, les cases sont vidées et le curseur revient dans la première
  useEffect(() => {
    if (etat.tentative > 0) premiereCase.current?.focus();
  }, [etat.tentative]);

  const preparer = () =>
    demarrerPreparation(async () => {
      setErreurPreparation(null);
      const resultat = await commencerMiseEnPlace(creerClientNavigateur());
      if (resultat.ok) setMiseEnPlace(resultat.miseEnPlace);
      else setErreurPreparation(resultat.message);
    });

  const attenteMiseEnPlace = mode === "mise-en-place" && !miseEnPlace;
  const message = erreurPreparation ?? etat.message;

  return (
    <form
      action={verifier}
      aria-labelledby="titre-verification"
      className="flex w-full max-w-[480px] flex-col gap-[22px] rounded-xl border border-bordure bg-surface p-6 sm:p-10"
    >
      <span className="self-start rounded-full bg-attention-fond px-2.5 py-1 text-[13px] font-bold tracking-[0.04em] text-attention-texte uppercase">
        {administrateur ? "Administrateur seulement" : "Double vérification"}
      </span>

      <div className="flex flex-col gap-1.5">
        <h1 id="titre-verification" className="font-serif text-[28px] leading-tight font-bold">
          {mode === "mise-en-place" ? "Reliez votre téléphone" : "Code de vérification"}
        </h1>
        {mode === "verification" ? (
          <p className="leading-normal text-texte-doux">
            Ouvrez l&apos;application d&apos;authentification sur votre téléphone et tapez le code à 6 chiffres affiché
            pour « {EMETTEUR} ».
          </p>
        ) : (
          <p className="leading-normal text-texte-doux">
            Pour protéger le compte <span className="font-mono font-semibold text-encre">{nomUtilisateur}</span>, chaque
            connexion demandera aussi un code à 6 chiffres affiché par votre téléphone. Cette mise en place se fait une
            seule fois.
          </p>
        )}
      </div>

      {message && (
        <p id="erreur-verification" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {message}
        </p>
      )}

      {etat.reconnexion ? (
        <Link href="/connexion" className={classeBouton}>
          Retour à la connexion
        </Link>
      ) : etat.recommencer ? (
        <button type="button" onClick={() => routeur.refresh()} className={classeBouton}>
          Recharger la page
        </button>
      ) : attenteMiseEnPlace ? (
        <>
          <ol className="flex list-decimal flex-col gap-2 pl-5 leading-normal">
            <li>
              Installez sur votre téléphone une application d&apos;authentification gratuite : <b>Google Authenticator</b>{" "}
              ou <b>Microsoft Authenticator</b>.
            </li>
            <li>Cliquez sur « Commencer » : un QR code va s&apos;afficher.</li>
            <li>Scannez-le avec l&apos;application, puis tapez le code qu&apos;elle affiche.</li>
          </ol>
          <button type="button" onClick={preparer} disabled={preparation} className={classeBouton}>
            {preparation ? "Préparation…" : "Commencer"}
          </button>
        </>
      ) : (
        <>
          {miseEnPlace && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-bordure p-4">
              <p className="self-start font-semibold">Scannez ce QR code avec l&apos;application du téléphone :</p>
              {/* Image produite par Supabase (SVG) : pas d'optimisation d'image nécessaire */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={miseEnPlace.qrCode}
                alt="QR code à scanner avec l'application d'authentification"
                width={192}
                height={192}
                className="size-48"
              />
              <details className="self-stretch text-[15px]">
                <summary className="cursor-pointer font-semibold text-bleu-etat">Impossible de scanner ?</summary>
                <p className="mt-2 text-texte-doux">
                  Dans l&apos;application, choisissez « Saisir une clé » et tapez :
                </p>
                <p data-testid="cle-secrete" className="mt-1 font-mono text-lg font-semibold break-words text-encre">
                  {cleLisible(miseEnPlace.cle)}
                </p>
              </details>
            </div>
          )}

          <SaisieCode
            key={etat.tentative}
            ref={premiereCase}
            name="code"
            invalide={Boolean(etat.message)}
            decritPar={etat.message ? "erreur-verification" : undefined}
          />

          <button type="submit" disabled={enCours} className={classeBouton}>
            {enCours ? "Vérification…" : miseEnPlace ? "Activer et continuer" : "Vérifier"}
          </button>
        </>
      )}

      <p className="text-sm text-texte-doux">
        Le code change toutes les 30 secondes. Téléphone perdu ? Contactez le service technique de la CDJP.
      </p>
      <p className="text-sm text-texte-doux">
        Ce n&apos;est pas votre compte ? <BoutonDeconnexion />
      </p>
    </form>
  );
}
