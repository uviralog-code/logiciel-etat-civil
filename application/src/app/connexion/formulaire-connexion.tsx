"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { ChampMotDePasse, classeChamp } from "@/components/champ-mot-de-passe";
import { VoyantReseau } from "@/components/voyant-reseau";
import { destinationFinale } from "@/lib/aiguillage";
import { connecterAgent, decrireNavigateur } from "@/lib/connexion";
import { creerClientNavigateur } from "@/lib/supabase/navigateur";

interface Etat {
  /** Message d'erreur à afficher (vide si aucun). */
  message: string | null;
  /** Champ à corriger, qui reçoit le curseur. */
  champ?: "nom" | "motDePasse";
  /** Nom saisi, gardé après une erreur (seul le mot de passe est effacé). */
  nom: string;
  /** Numéro de la tentative : sert à replacer le curseur après chaque erreur. */
  tentative: number;
}

const ETAT_INITIAL: Etat = { message: null, nom: "", tentative: 0 };

/** Explications affichées quand on arrive ici après une déconnexion imposée. */
const EXPLICATIONS: Record<string, string> = {
  desactive: "Ce compte a été désactivé : la session a été fermée. Adressez-vous à l'administrateur (CDJP).",
};

/** Paramètre de l'adresse (lu dans le navigateur ; la page elle-même reste préparée à l'avance). */
function useParametre(nom: string): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get(nom),
    () => null,
  );
}

export function FormulaireConnexion() {
  const routeur = useRouter();
  const champNom = useRef<HTMLInputElement>(null);
  const champMotDePasse = useRef<HTMLInputElement>(null);
  const motif = useParametre("motif");
  const explication = motif ? (EXPLICATIONS[motif] ?? null) : null;

  const [etat, seConnecter, enCours] = useActionState(async (precedent: Etat, donnees: FormData): Promise<Etat> => {
    const nom = String(donnees.get("nom") ?? "");
    const resultat = await connecterAgent(
      creerClientNavigateur(),
      { nom, motDePasse: String(donnees.get("motDePasse") ?? "") },
      { navigateur: decrireNavigateur(navigator.userAgent) },
    );
    if (resultat.ok) {
      // L'écran reste « en cours » jusqu'à l'affichage de la page suivante
      // Retour à la page où l'agent se trouvait, si elle est dans son espace
      const suite = new URLSearchParams(window.location.search).get("suite");
      routeur.replace(destinationFinale(resultat.destination, suite));
      return { ...precedent, message: null, nom };
    }
    return { message: resultat.message, champ: resultat.champ, nom, tentative: precedent.tentative + 1 };
  }, ETAT_INITIAL);

  // Après une erreur, le curseur va dans le champ à corriger
  useEffect(() => {
    if (etat.tentative === 0) return;
    (etat.champ === "nom" ? champNom : champMotDePasse).current?.focus();
  }, [etat.tentative, etat.champ]);

  const erreurNom = etat.message && etat.champ === "nom";
  const erreurMotDePasse = etat.message && etat.champ === "motDePasse";

  return (
    <form
      action={seConnecter}
      aria-labelledby="titre-connexion"
      className="flex w-full max-w-[440px] flex-col gap-6 rounded-xl border border-bordure bg-surface p-6 sm:p-10"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="titre-connexion" className="font-serif text-3xl font-bold">
          Connexion
        </h2>
        <p className="text-texte-doux">Entrez votre nom d&apos;utilisateur et votre mot de passe.</p>
      </div>

      <VoyantReseau />

      {explication && !etat.message && (
        <p role="status" className="rounded-lg bg-attention-fond px-3.5 py-2.5 font-semibold text-attention-texte">
          {explication}
        </p>
      )}

      {etat.message && (
        <p id="erreur-connexion" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {etat.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="nom" className="font-semibold">
          Nom d&apos;utilisateur
        </label>
        <input
          ref={champNom}
          id="nom"
          name="nom"
          type="text"
          required
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={etat.nom}
          aria-invalid={erreurNom ? true : undefined}
          aria-describedby={erreurNom ? "erreur-connexion" : undefined}
          className={classeChamp}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="motDePasse" className="font-semibold">
          Mot de passe
        </label>
        <ChampMotDePasse
          ref={champMotDePasse}
          id="motDePasse"
          autoComplete="current-password"
          invalide={Boolean(erreurMotDePasse)}
          decritPar={erreurMotDePasse ? "erreur-connexion" : undefined}
        />
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="h-[52px] rounded-lg bg-bleu-etat text-lg font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
      >
        {enCours ? "Connexion en cours…" : "Se connecter"}
      </button>

      <p className="text-sm text-texte-doux">
        Mot de passe oublié ? Adressez-vous à l&apos;administrateur (CDJP), qui vous attribuera un mot de passe provisoire.
      </p>
    </form>
  );
}
