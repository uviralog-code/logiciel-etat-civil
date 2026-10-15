import Link from "next/link";
import { STATUTS, type StatutActe } from "@/lib/charte";
import { libelleStatut } from "@/lib/accueil-officier";
import { adresseRecherche, anneesProposees, LIMITE_RESULTATS, type CriteresRecherche, type ReponseRecherche } from "@/lib/recherche";
import { formaterDate } from "@/lib/tarifs";
import { Icone } from "./icone";

const classeChamp = "h-12 w-full min-w-0 rounded-lg border border-bordure-champ bg-surface px-3 text-[17px] text-encre";
const cellule = "border-b border-[#edf0f5] px-4 py-3 align-top";

/**
 * Barre de recherche unique (maquette « Officier — Accueil ») : un formulaire
 * GET, la recherche vit donc dans l'adresse. Utilisée aussi sur l'accueil.
 */
export function BarreRecherche({ action, valeur = "", autoFocus = false }: { action: string; valeur?: string; autoFocus?: boolean }) {
  return (
    <form role="search" action={action} method="get" className="flex flex-wrap gap-3">
      <label htmlFor="recherche" className="sr-only">
        Rechercher un acte
      </label>
      <div className="flex h-[60px] min-w-0 flex-[1_1_420px] items-center gap-3 rounded-[10px] border border-bordure-champ bg-surface px-[18px] focus-within:outline-3 focus-within:outline-[#8db4f2]">
        <span className="text-texte-doux">
          <Icone nom="recherche" />
        </span>
        <input
          id="recherche"
          name="q"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          defaultValue={valeur}
          placeholder="Rechercher par ID (MUL-EXNAIS-2026-123) ou par nom (titulaire, époux, demandeur)"
          className="min-w-0 flex-1 border-0 bg-transparent text-lg text-encre outline-none"
        />
      </div>
      <button type="submit" className="h-[60px] rounded-[10px] bg-bleu-etat px-7 text-lg font-bold text-white hover:bg-bleu-etat-fonce">
        Rechercher
      </button>
    </form>
  );
}

/** L'écran « Rechercher » : barre, filtres, résultats. */
export function RechercheActes({
  base,
  lienFiche,
  criteres,
  reponse,
  types,
  anneeEnCours,
  avecEntite = false,
}: {
  /** Ex. « /officier/recherche ». */
  base: string;
  /** Ex. « /officier/actes » : la fiche s'ouvre à {lienFiche}/{id}. */
  lienFiche: string;
  criteres: CriteresRecherche;
  reponse: ReponseRecherche;
  types: { id: string; numero: number; libelle: string; actif: boolean }[];
  anneeEnCours: number;
  /** Administrateur : une colonne « Entité ». */
  avecEntite?: boolean;
}) {
  const retour = encodeURIComponent(adresseRecherche(base, criteres));
  const filtresActifs = Boolean(criteres.typeActeId || criteres.annee || criteres.statut);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Rechercher un acte</h1>
        <p className="text-[17px] text-texte-doux">
          Par ID complet ou début d&apos;ID, ou par nom (titulaire, époux, demandeur) : l&apos;ordre des noms, les accents et les
          fautes de frappe sont tolérés. Le n° d&apos;un ancien registre papier est aussi reconnu.
        </p>
      </div>

      <form role="search" action={base} method="get" className="flex flex-col gap-4" aria-label="Recherche et filtres">
        <div className="flex flex-wrap gap-3">
          <label htmlFor="recherche" className="sr-only">
            Rechercher un acte
          </label>
          <div className="flex h-[60px] min-w-0 flex-[1_1_420px] items-center gap-3 rounded-[10px] border border-bordure-champ bg-surface px-[18px] focus-within:outline-3 focus-within:outline-[#8db4f2]">
            <span className="text-texte-doux">
              <Icone nom="recherche" />
            </span>
            <input
              id="recherche"
              name="q"
              type="search"
              autoComplete="off"
              autoFocus={!criteres.texte}
              defaultValue={criteres.texte}
              placeholder="ID (MUL-EXNAIS-2026-123) ou nom (titulaire, époux, demandeur)"
              className="min-w-0 flex-1 border-0 bg-transparent text-lg text-encre outline-none"
            />
          </div>
          <button type="submit" className="h-[60px] rounded-[10px] bg-bleu-etat px-7 text-lg font-bold text-white hover:bg-bleu-etat-fonce">
            Rechercher
          </button>
        </div>
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <legend className="sr-only">Filtres</legend>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="filtre-type" className="text-[15px] font-semibold">
              Type d&apos;acte
            </label>
            <select id="filtre-type" name="type" defaultValue={criteres.typeActeId ?? ""} className={classeChamp}>
              <option value="">Tous les types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.numero).padStart(2, "0")} · {t.libelle}
                  {t.actif ? "" : " (retiré)"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="filtre-annee" className="text-[15px] font-semibold">
              Année
            </label>
            <select id="filtre-annee" name="annee" defaultValue={criteres.annee ?? ""} className={classeChamp}>
              <option value="">Toutes les années</option>
              {anneesProposees(anneeEnCours).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="filtre-statut" className="text-[15px] font-semibold">
              Statut
            </label>
            <select id="filtre-statut" name="statut" defaultValue={criteres.statut ?? ""} className={classeChamp}>
              <option value="">Tous les statuts</option>
              {(Object.keys(STATUTS) as StatutActe[]).map((s) => (
                <option key={s} value={s}>
                  {STATUTS[s].libelle}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </form>

      {reponse.etat === "vide" && (
        <p className="text-texte-doux">Tapez un ID ou un nom, puis « Rechercher ». Les filtres affinent les résultats.</p>
      )}
      {reponse.etat === "erreur" && (
        <p role="alert" className="rounded-lg bg-attention-fond px-4 py-3 font-semibold text-attention-texte">
          {reponse.message}
        </p>
      )}
      {reponse.etat === "trouve" && (
        <section aria-labelledby="titre-resultats" className="flex flex-col gap-3">
          <h2 id="titre-resultats" className="text-xl font-bold" role="status">
            {reponse.resultats.length === 0
              ? `Aucun acte trouvé pour « ${criteres.texte} »${filtresActifs ? " avec ces filtres" : ""}.`
              : reponse.tronque
                ? `Plus de ${LIMITE_RESULTATS} actes trouvés : les ${LIMITE_RESULTATS} plus proches sont affichés. Précisez la recherche ou ajoutez un filtre.`
                : `${reponse.resultats.length} acte${reponse.resultats.length > 1 ? "s" : ""} trouvé${reponse.resultats.length > 1 ? "s" : ""}`}
          </h2>
          {reponse.resultats.length > 0 && (
            <div className="relative overflow-x-auto rounded-[10px] border border-bordure bg-surface">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                    {["ID de l'acte", ...(avecEntite ? ["Entité"] : []), "Type", "Titulaire", "Date", "Statut"].map((t) => (
                      <th key={t} scope="col" className="border-b border-bordure px-4 py-2.5">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reponse.resultats.map((r) => {
                    const statut = STATUTS[r.statut];
                    return (
                      <tr key={r.acteId} data-resultat={r.identifiant}>
                        <td className={`${cellule} font-mono text-[15px] font-semibold whitespace-nowrap`}>
                          <Link href={`${lienFiche}/${r.acteId}?retour=${retour}`}>{r.identifiant}</Link>
                        </td>
                        {avecEntite && <td className={cellule}>{r.entiteCode}</td>}
                        <td className={cellule}>{r.typeLibelle}</td>
                        <td className={cellule}>
                          <span className="flex flex-col">
                            <span className="font-semibold">
                              {r.titulaire}
                              {r.titulaire2 && ` et ${r.titulaire2}`}
                            </span>
                            {r.demandeur && <span className="text-sm text-texte-doux">Demandeur : {r.demandeur}</span>}
                            {r.numeroRegistre && <span className="text-sm text-texte-doux">Reg. n° {r.numeroRegistre}</span>}
                          </span>
                        </td>
                        <td className={`${cellule} whitespace-nowrap`}>{formaterDate(r.dateActe)}</td>
                        <td className={cellule}>
                          <span className="rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap" style={{ background: statut.fond, color: statut.texte }}>
                            {libelleStatut(r.statut, r.scanne)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
