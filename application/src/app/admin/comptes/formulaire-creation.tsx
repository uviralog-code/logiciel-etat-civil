"use client";

import { useActionState, useState } from "react";
import { FicheRemise } from "@/components/fiche-remise";
import { nomUtilisateurPropose, type Poste, type RoleAgent } from "@/lib/creation-compte";
import { creerCompte, type EtatCreation } from "./actions";

const LIBELLE_ROLE: Record<RoleAgent, string> = { officier: "Officier d'état civil", caissier: "Caissier" };
const classeChamp =
  "h-12 rounded-lg border border-bordure-champ bg-surface px-3.5 text-lg text-encre aria-invalid:border-2 aria-invalid:border-erreur-texte";

/**
 * Formulaire « Créer un compte » (maquette « Admin — Comptes »).
 * Ne propose que les postes libres. Après la création, le mot de passe provisoire
 * est affiché UNE SEULE FOIS : il n'est enregistré nulle part.
 */
export function FormulaireCreation({ postes, selection }: { postes: Poste[]; selection?: string | null }) {
  const trouver = (cle: string | null | undefined) => postes.find((p) => `${p.entite.code}-${p.role}` === cle);
  const depart = trouver(selection) ?? postes[0];
  const [entite, setEntite] = useState(depart?.entite.code ?? "");
  const [role, setRole] = useState<RoleAgent>(depart?.role ?? "officier");
  const [nomComplet, setNomComplet] = useState("");
  const [nomSaisi, setNomSaisi] = useState<string | null>(null); // null : suggestion automatique

  // « Créer » sur une autre ligne du tableau : le formulaire suit, SANS être reconstruit
  // (un mot de passe provisoire affiché ne doit jamais disparaître à cause d'un clic)
  const [selectionSuivie, setSelectionSuivie] = useState(selection);
  if (selection !== selectionSuivie) {
    setSelectionSuivie(selection);
    const poste = trouver(selection);
    if (poste) {
      setEntite(poste.entite.code);
      setRole(poste.role);
      setNomSaisi(null);
    }
  }
  const [etat, creer, enCours] = useActionState<EtatCreation, FormData>(creerCompte, { ok: null });
  // Résultat déjà lu par l'administrateur (« J'ai noté le mot de passe ») : il n'est plus affiché
  const [lu, setLu] = useState<EtatCreation | null>(null);

  // Les postes libres changent (création, désactivation…) : si le choix en cours n'est plus
  // un poste libre, on se cale sur le premier poste libre.
  const entites = [...new Map(postes.map((p) => [p.entite.code, p.entite])).values()];
  const entiteEffective = entites.some((e) => e.code === entite) ? entite : (postes[0]?.entite.code ?? "");
  const rolesLibres = postes.filter((p) => p.entite.code === entiteEffective).map((p) => p.role);
  const roleEffectif: RoleAgent = rolesLibres.includes(role) ? role : (rolesLibres[0] ?? role);
  const entiteChoisie = entites.find((e) => e.code === entiteEffective);
  const nomUtilisateur = nomSaisi ?? (entiteChoisie ? nomUtilisateurPropose(entiteChoisie.nom, roleEffectif) : "");

  const choisirEntite = (code: string) => {
    setEntite(code);
    const libres = postes.filter((p) => p.entite.code === code).map((p) => p.role);
    if (!libres.includes(role) && libres[0]) setRole(libres[0]);
    setNomSaisi(null);
  };

  // Compte créé : mot de passe provisoire, affiché une seule fois
  if (etat.ok === true && lu !== etat) {
    return (
      <section
        id="creer-compte"
        aria-labelledby="titre-cree"
        className="flex w-full max-w-[560px] flex-col gap-[18px] rounded-[10px] border border-bordure bg-surface p-6"
      >
        <h2 id="titre-cree" className="text-xl font-bold">
          Compte créé
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-texte-doux">Agent</dt>
          <dd className="font-semibold">{etat.nomComplet}</dd>
          <dt className="text-texte-doux">Poste</dt>
          <dd>
            {LIBELLE_ROLE[etat.role]} · {etat.entite}
          </dd>
          <dt className="text-texte-doux">Nom d&apos;utilisateur</dt>
          <dd className="font-mono font-semibold">{etat.nomUtilisateur}</dd>
        </dl>
        <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-[#c5d4ee] bg-[#f0f5ff] p-4">
          <span className="text-[15px] font-semibold text-bleu-etat">Mot de passe provisoire (affiché une seule fois)</span>
          <span data-testid="mot-de-passe-provisoire" className="font-mono text-2xl font-semibold tracking-[0.06em]">
            {etat.motDePasse}
          </span>
          <span className="text-sm text-[#374151]">
            Remettez-le à l&apos;agent en main propre. Il devra le changer à sa première connexion. Notez-le maintenant :
            il ne pourra plus être affiché.
          </span>
        </div>
        <FicheRemise
          fiche={{
            nomComplet: etat.nomComplet,
            nomUtilisateur: etat.nomUtilisateur,
            motDePasse: etat.motDePasse,
            poste: `${LIBELLE_ROLE[etat.role]} · ${etat.entite}`,
            motif: "creation",
          }}
        />
        <button
          type="button"
          onClick={() => {
            setLu(etat);
            setNomComplet("");
            setNomSaisi(null);
            // Le poste vient d'être pourvu : on repart du premier poste encore libre
            const suivant = postes[0];
            if (suivant) {
              setEntite(suivant.entite.code);
              setRole(suivant.role);
            }
          }}
          className="h-[52px] rounded-lg bg-bleu-etat text-[17px] font-bold text-white hover:bg-bleu-etat-fonce"
        >
          J&apos;ai noté le mot de passe
        </button>
      </section>
    );
  }

  if (postes.length === 0) {
    return (
      <section
        id="creer-compte"
        className="flex w-full max-w-[560px] flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-6"
      >
        <h2 className="text-xl font-bold">Créer un compte</h2>
        <p className="leading-normal">Tous les postes sont pourvus : chaque entité a son officier et son caissier.</p>
        <p className="text-sm leading-normal text-texte-doux">
          Pour remplacer un agent, désactivez d&apos;abord l&apos;ancien compte : il reste conservé pour l&apos;historique.
        </p>
      </section>
    );
  }

  const erreur = etat.ok === false ? etat : null;
  const champEnErreur = (c: string) => (erreur?.champ === c ? true : undefined);

  return (
    <form
      id="creer-compte"
      action={creer}
      aria-labelledby="titre-creation"
      className="flex w-full max-w-[560px] flex-col gap-[18px] rounded-[10px] border border-bordure bg-surface p-6"
    >
      <h2 id="titre-creation" className="text-xl font-bold">
        Créer un compte
      </h2>

      {erreur && (
        <p id="erreur-creation" role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
          {erreur.message}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="entite" className="font-semibold">
          Entité
        </label>
        <select
          id="entite"
          name="entite"
          value={entiteEffective}
          onChange={(e) => choisirEntite(e.target.value)}
          aria-invalid={champEnErreur("entite")}
          className={classeChamp}
        >
          {entites.map((e) => (
            <option key={e.code} value={e.code}>
              {e.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="role" className="font-semibold">
          Rôle
        </label>
        <select
          id="role"
          name="role"
          value={roleEffectif}
          onChange={(e) => setRole(e.target.value as RoleAgent)}
          aria-invalid={champEnErreur("role")}
          className={classeChamp}
        >
          {rolesLibres.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="nomComplet" className="font-semibold">
          Nom complet de l&apos;agent
        </label>
        <input
          id="nomComplet"
          name="nomComplet"
          type="text"
          required
          minLength={3}
          maxLength={100}
          autoComplete="off"
          value={nomComplet}
          onChange={(e) => setNomComplet(e.target.value)}
          aria-invalid={champEnErreur("nomComplet")}
          aria-describedby={erreur?.champ === "nomComplet" ? "erreur-creation" : undefined}
          className={classeChamp}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="nomUtilisateur" className="font-semibold">
          Nom d&apos;utilisateur
        </label>
        <input
          id="nomUtilisateur"
          name="nomUtilisateur"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={nomUtilisateur}
          onChange={(e) => setNomSaisi(e.target.value)}
          aria-invalid={champEnErreur("nomUtilisateur")}
          aria-describedby="aide-nom-utilisateur"
          className={`${classeChamp} font-mono`}
        />
        <span id="aide-nom-utilisateur" className="text-sm text-texte-doux">
          Proposé automatiquement d&apos;après l&apos;entité et le rôle. L&apos;agent le tapera pour se connecter.
        </span>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border border-[#c5d4ee] bg-[#f0f5ff] p-4 text-sm text-[#374151]">
        <span className="text-[15px] font-semibold text-bleu-etat">Mot de passe provisoire</span>
        Il sera tiré au hasard et affiché une seule fois, juste après la création.
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="h-[52px] rounded-lg bg-bleu-etat text-[17px] font-bold text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75"
      >
        {enCours ? "Création…" : "Créer le compte"}
      </button>
      <p className="text-sm leading-[1.45] text-texte-doux">
        Un seul officier et un seul caissier actifs par entité. Pour remplacer un agent, désactivez d&apos;abord
        l&apos;ancien compte : il reste conservé pour l&apos;historique.
      </p>
    </form>
  );
}
