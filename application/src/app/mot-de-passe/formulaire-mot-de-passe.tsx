"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { BoutonDeconnexion } from "@/components/bouton-deconnexion";
import { ChampMotDePasse } from "@/components/champ-mot-de-passe";
import { changerMotDePasse, reglesMotDePasse } from "@/lib/mot-de-passe";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";

interface Etat {
  message: string | null;
  champ?: "nouveau" | "confirmation";
  motDePasseEnregistre?: boolean;
  reconnexion?: boolean;
  tentative: number;
}

const ETAT_INITIAL: Etat = { message: null, tentative: 0 };

export function FormulaireMotDePasse({ nomUtilisateur, destination }: { nomUtilisateur: string; destination: string }) {
  const routeur = useRouter();
  const champNouveau = useRef<HTMLInputElement>(null);
  const [saisie, setSaisie] = useState({ nouveau: "", confirmation: "" });
  const regles = reglesMotDePasse(saisie.nouveau, saisie.confirmation);

  const [etat, enregistrer, enCours] = useActionState(async (precedent: Etat, donnees: FormData): Promise<Etat> => {
    const resultat = await changerMotDePasse(
      creerClientNavigateur(),
      { nouveau: String(donnees.get("nouveau") ?? ""), confirmation: String(donnees.get("confirmation") ?? "") },
      { motDePasseDejaEnregistre: precedent.motDePasseEnregistre },
    );
    if (resultat.ok) {
      routeur.replace(destination);
      return { ...precedent, message: null };
    }
    // Les champs sont vidés après l'envoi : les règles repartent de zéro
    setSaisie({ nouveau: "", confirmation: "" });
    return {
      message: resultat.message,
      champ: resultat.champ,
      motDePasseEnregistre: precedent.motDePasseEnregistre || resultat.motDePasseEnregistre,
      reconnexion: resultat.reconnexion,
      tentative: precedent.tentative + 1,
    };
  }, ETAT_INITIAL);

  useEffect(() => {
    if (etat.tentative > 0 && etat.champ) champNouveau.current?.focus();
  }, [etat.tentative, etat.champ]);

  const demanderSaisie = !etat.motDePasseEnregistre && !etat.reconnexion;

  return (
    <form
      action={enregistrer}
      aria-labelledby="titre-mot-de-passe"
      className="flex w-full max-w-[480px] flex-col gap-[22px] rounded-xl border border-bordure bg-surface p-6 sm:p-10"
    >
      <span className="self-start rounded-full bg-bleu-clair px-2.5 py-1 text-[13px] font-bold tracking-[0.04em] text-bleu-etat uppercase">
        Première connexion
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 id="titre-mot-de-passe" className="font-serif text-[28px] leading-tight font-bold">
          Choisissez votre mot de passe
        </h1>
        <p className="leading-normal text-texte-doux">
          Le mot de passe provisoire donné par l&apos;administrateur doit être remplacé avant de commencer.
        </p>
        <p className="text-texte-doux">
          Compte : <span className="font-mono font-semibold text-encre">{nomUtilisateur}</span>
        </p>
      </div>

      {etat.message && (
        <p
          id="erreur-mot-de-passe"
          role="alert"
          className={`rounded-lg px-3.5 py-2.5 font-semibold ${
            etat.motDePasseEnregistre ? "bg-attention-fond text-attention-texte" : "bg-erreur-fond text-erreur-texte"
          }`}
        >
          {etat.message}
        </p>
      )}

      {demanderSaisie && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="nouveau" className="font-semibold">
              Nouveau mot de passe
            </label>
            <ChampMotDePasse
              ref={champNouveau}
              id="nouveau"
              autoComplete="new-password"
              quoi="le nouveau mot de passe"
              invalide={etat.champ === "nouveau"}
              decritPar={etat.champ === "nouveau" ? "erreur-mot-de-passe regles-mot-de-passe" : "regles-mot-de-passe"}
              onChange={(nouveau) => setSaisie((s) => ({ ...s, nouveau }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="confirmation" className="font-semibold">
              Confirmez le mot de passe
            </label>
            <ChampMotDePasse
              id="confirmation"
              autoComplete="new-password"
              quoi="la confirmation"
              invalide={etat.champ === "confirmation"}
              decritPar={etat.champ === "confirmation" ? "erreur-mot-de-passe" : undefined}
              onChange={(confirmation) => setSaisie((s) => ({ ...s, confirmation }))}
            />
          </div>

          <ul id="regles-mot-de-passe" className="flex flex-col gap-2 text-[15px]">
            {regles.map((regle) => (
              <li
                key={regle.id}
                data-regle={regle.id}
                data-respectee={regle.respectee}
                className={`flex items-center gap-2 ${regle.respectee ? "text-succes-texte" : "text-texte-doux"}`}
              >
                {regle.respectee ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                )}
                {regle.libelle}
                <span className="sr-only">{regle.respectee ? " : respectée" : " : pas encore respectée"}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {etat.reconnexion ? (
        <Link
          href="/connexion"
          className="flex h-[52px] items-center justify-center rounded-lg bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce"
        >
          Retour à la connexion
        </Link>
      ) : (
        <button
          type="submit"
          disabled={enCours}
          className="h-[52px] rounded-lg bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
        >
          {enCours ? "Enregistrement…" : etat.motDePasseEnregistre ? "Terminer l'enregistrement" : "Enregistrer et continuer"}
        </button>
      )}

      <p className="text-sm text-texte-doux">
        Ce n&apos;est pas votre compte ? <BoutonDeconnexion />
      </p>
    </form>
  );
}
