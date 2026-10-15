import Link from "next/link";
import type { ReactNode } from "react";
import { FAMILLES, STATUTS } from "@/lib/charte";
import { actionsPossibles, cheminPrevu, informationsActe, parcoursActe, resumeVersion, statutAffiche, type FicheActe } from "@/lib/fiche-acte";

const STYLE_ETAPE = {
  fait: "border-bordure bg-surface",
  "a-venir": "border-dashed border-bordure-champ bg-transparent text-texte-doux",
  scanne: "border-[#a7d3b1] bg-succes-fond text-succes-texte",
  annule: "border-[#e8a3a3] bg-erreur-fond text-erreur-texte",
} as const;

/**
 * Contenu de la fiche d'un acte (maquette « Officier — Fiche d'un acte ») :
 * en-tête, parcours, informations, document scanné. Les boutons (officier)
 * arrivent par « actions » ; le Caissier et l'administrateur la lisent sans boutons.
 */
export function FicheActeVue({
  fiche,
  espace,
  actions,
  avecScan = false,
}: {
  fiche: FicheActe;
  /** Espace de la personne connectée : le lien « Voir le document » y reste. */
  espace: "/officier" | "/caissier" | "/admin";
  actions?: ReactNode;
  /** Officier : boutons « Scanner l'acte » et « Refaire le scan ». */
  avecScan?: boolean;
}) {
  const { acte } = fiche;
  const possibles = actionsPossibles(fiche);
  const [derniere, ...anciennes] = fiche.scans;
  const statut = STATUTS[acte.statut];
  const couleur = acte.type.couleur ?? FAMILLES[acte.type.famille].couleur;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md px-2.5 py-1 text-[15px] font-bold text-white" style={{ background: couleur }}>
              {acte.type.libelle}
            </span>
            <span className="rounded-full px-3 py-1 text-[15px] font-bold" style={{ background: statut.fond, color: statut.texte }} data-testid="statut">
              {statutAffiche(fiche)}
            </span>
          </div>
          <h1 className="font-mono text-[34px] font-semibold break-all">{acte.identifiant}</h1>
          <span className="text-xl">
            {acte.titulaire_nom}
            {acte.titulaire_2_nom && ` et ${acte.titulaire_2_nom}`}
          </span>
        </div>
        {actions && <div className="flex flex-col items-end gap-3">{actions}</div>}
      </div>

      {acte.statut === "enregistre" && acte.motif_renvoi && (
        <p role="note" className="rounded-lg border border-[#e8c766] bg-attention-fond px-4 py-3 text-attention-texte">
          <strong>Renvoyé par le Caissier</strong> — motif : « {acte.motif_renvoi} »
        </p>
      )}

      <section aria-label="Parcours de l'acte">
        <ol className="flex flex-wrap gap-3" data-testid="parcours">
          {parcoursActe(fiche).map((e) => (
            <li key={e.libelle} className={`flex min-w-[150px] flex-col gap-1 rounded-[10px] border px-4 py-3 ${STYLE_ETAPE[e.etat]}`}>
              <strong>{e.libelle}</strong>
              {e.details.map((d) => (
                <span key={d} className={d.match(/^[A-Z]{3}-REC-/) ? "font-mono text-encre" : "text-[15px]"}>
                  {d}
                </span>
              ))}
              {e.etat === "a-venir" && <span className="text-sm">pas encore</span>}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="titre-informations" className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] rounded-[10px] border border-bordure bg-surface p-6">
          <h2 id="titre-informations" className="text-xl font-bold">
            Informations
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,220px)_1fr]" data-testid="informations">
            {informationsActe(fiche).map(([libelle, valeur]) => (
              <div key={libelle} className="contents">
                <dt className="text-texte-doux">{libelle}</dt>
                <dd className="font-semibold">{valeur}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="titre-document" className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[10px] border border-bordure bg-surface p-6">
          <h2 id="titre-document" className="text-xl font-bold">
            Document scanné
          </h2>
          {fiche.document && derniere ? (
            <>
              <span className="font-mono text-[13px] font-semibold break-all" data-testid="chemin-document">
                {derniere.chemin_stockage}
              </span>
              <span className="text-[15px] text-texte-doux" data-testid="version-document">
                {resumeVersion(derniere, fiche.noms)}
              </span>
              {derniere.motif_remplacement && <span className="text-[15px]">Scan refait : « {derniere.motif_remplacement} »</span>}
              <div className="flex flex-wrap gap-3">
                <a
                  href={`${espace}/actes/${acte.id}/document`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-11 items-center rounded-lg bg-bleu-etat px-4 font-bold text-white no-underline hover:bg-bleu-etat-fonce"
                >
                  Voir le document
                </a>
                {avecScan && possibles.refaireScan && (
                  <Link
                    href={`/officier/actes/${acte.id}/scanner`}
                    className="inline-flex h-11 items-center rounded-lg border border-bleu-etat px-4 font-bold text-bleu-etat no-underline hover:bg-bleu-clair"
                  >
                    Refaire le scan
                  </Link>
                )}
              </div>
              {anciennes.length > 0 && (
                <details className="text-[15px]">
                  <summary className="cursor-pointer font-semibold">
                    Version{anciennes.length > 1 ? "s" : ""} précédente{anciennes.length > 1 ? "s" : ""} ({anciennes.length})
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {anciennes.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0f5] pt-2">
                        <span className="text-texte-doux">{resumeVersion(v, fiche.noms)}</span>
                        <a href={`${espace}/actes/${acte.id}/document?version=${v.version}`} target="_blank" rel="noopener" className="font-semibold">
                          Voir la version {v.version}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <>
              <p className="text-texte-doux">
                {acte.statut === "annule" ? "Acte annulé : pas de scan." : "Pas encore scanné. Seul l'acte délivré, signé et cacheté, se scanne."}
              </p>
              {acte.statut !== "annule" && (
                <span className="text-sm text-texte-doux">
                  Sera rangé sous <span className="font-mono break-all">{cheminPrevu(fiche)}</span>
                </span>
              )}
              {avecScan && possibles.scanner && (
                <Link
                  href={`/officier/actes/${acte.id}/scanner`}
                  className="inline-flex h-11 items-center self-start rounded-lg bg-bleu-etat px-4 font-bold text-white no-underline hover:bg-bleu-etat-fonce"
                >
                  Scanner l&apos;acte
                </Link>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
