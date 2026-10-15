import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { etatJournee } from "@/lib/accueil-caissier";
import { dateDuJour } from "@/lib/espaces";
import { lireJourneeCaisse, obstacleAnnulation, peutRevenirEnFile } from "@/lib/recus-du-jour";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterMontant } from "@/lib/tarifs";
import { Annonces, RelireAuRetour } from "../actualisation";
import { BoutonAnnulerRecu } from "../bouton-annuler-recu";

export const metadata: Metadata = { title: "Reçus du jour" };

/** « Reçus du jour » (fichier 40) : reçus et exonérations de la journée, totaux, annulation d'un reçu. */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <RecusDuJour />
    </Suspense>
  );
}

function Tuile({ libelle, valeur, note, alerte = false }: { libelle: string; valeur: string; note?: string; alerte?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-bordure bg-surface px-[22px] py-5">
      <span className="text-[15px] text-texte-doux">{libelle}</span>
      <strong className="text-[28px] leading-tight font-bold break-words">{valeur}</strong>
      {note && <span className={`text-[15px] ${alerte ? "text-erreur-texte" : "text-texte-doux"}`}>{note}</span>}
    </div>
  );
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

async function RecusDuJour() {
  const agent = await exigerEspace("caissier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const jour = aujourdhuiUvira();
  const { recus, exonerations, totaux, clotureLe } = await lireJourneeCaisse(supabase, entite.id, jour);
  const exonere = [totaux.exonereUsd ? formaterMontant(totaux.exonereUsd, "USD") : null, totaux.exonereCdf ? formaterMontant(totaux.exonereCdf, "CDF") : null]
    .filter(Boolean)
    .join(" et ");

  return (
    <CadreEspace
      agent={agent}
      actif="/caissier/recus"
      enTete={
        <span className="text-texte-doux" data-testid="etat-journee">
          {dateDuJour()} · {etatJournee(clotureLe)}
        </span>
      }
    >
      <RelireAuRetour />
      <h1 className="font-serif text-[30px] font-bold">Reçus du jour</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="totaux-du-jour">
        <Tuile libelle="Encaissé en dollars" valeur={formaterMontant(totaux.usd, "USD")} />
        <Tuile libelle="Encaissé en francs" valeur={formaterMontant(totaux.cdf, "CDF")} />
        <Tuile libelle="Total en équivalent FC" valeur={formaterMontant(totaux.equivalentCdf, "CDF")} />
        <Tuile
          libelle="Reçus valides"
          valeur={String(totaux.valides)}
          note={[totaux.annules ? pluriel(totaux.annules, "annulé") : null, totaux.exonerations ? pluriel(totaux.exonerations, "exonération") : null].filter(Boolean).join(" · ")}
          alerte={totaux.annules > 0}
        />
      </div>

      <Annonces />

      <section aria-labelledby="titre-liste-recus" className="overflow-hidden rounded-[10px] border border-bordure bg-surface">
        <h2 id="titre-liste-recus" className="px-5 py-[18px] text-xl font-bold">
          Reçus <span className="font-medium text-texte-doux">({recus.length})</span>
        </h2>
        {recus.length === 0 ? (
          <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun reçu émis aujourd&apos;hui.</p>
        ) : (
          <ul>
            {recus.map((r) => {
              const annule = r.statut === "annule";
              const obstacle = obstacleAnnulation(r, clotureLe);
              return (
                <li
                  key={r.id}
                  data-recu-jour={r.numero}
                  className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-[#edf0f5] px-5 py-3.5 lg:grid-cols-[70px_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] lg:items-center"
                >
                  <span className="text-texte-doux">{heureUvira(r.encaisseLe)}</span>
                  <Link href={`/caissier/recus/${r.id}`} className={`font-mono text-[15px] font-semibold break-all ${annule ? "text-[#6b7280] line-through" : ""}`}>
                    {r.numero}
                  </Link>
                  <span className={`flex min-w-0 flex-col ${annule ? "text-[#6b7280]" : ""}`}>
                    <span className="truncate">{r.acte.typeLibelle}</span>
                    <span className="text-sm text-texte-doux">
                      <Link href={`/caissier/actes/${r.acte.id}`} className="font-mono text-texte-doux">
                        {r.acte.identifiant}
                      </Link>{" "}
                      · {r.acte.titulaire}
                    </span>
                  </span>
                  <span className={`text-lg font-bold ${annule ? "text-[#6b7280] line-through" : ""}`}>{formaterMontant(r.montant, r.devise)}</span>
                  <span className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {annule ? (
                      <span className="rounded-lg bg-erreur-fond px-2.5 py-1 text-sm font-bold text-erreur-texte" data-annulation>
                        Annulé · {r.motifAnnulation}
                        {r.suiteAnnulation === "acte_remis_en_file" ? " · acte remis dans la file" : r.suiteAnnulation === "acte_annule" ? " · acte annulé" : ""}
                      </span>
                    ) : (
                      <>
                        <span className="rounded-full bg-succes-fond px-2.5 py-1 text-sm font-bold text-succes-texte">Valide</span>
                        {obstacle == null && (
                          <BoutonAnnulerRecu
                            recu={{
                              id: r.id,
                              numero: r.numero,
                              montant: formaterMontant(r.montant, r.devise),
                              acte: r.acte.identifiant,
                              titulaire: r.acte.titulaire,
                              peutRevenirEnFile: peutRevenirEnFile(r.acte.statut),
                            }}
                          />
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {clotureLe && (
          <p className="border-t border-[#edf0f5] bg-attention-fond px-5 py-3 font-semibold text-attention-texte">
            Journée clôturée à {heureUvira(clotureLe)} : les reçus ne peuvent plus être annulés.
          </p>
        )}
      </section>

      <section aria-labelledby="titre-exonerations" className="overflow-hidden rounded-[10px] border border-bordure bg-surface">
        <h2 id="titre-exonerations" className="px-5 py-[18px] text-xl font-bold">
          Exonérations <span className="font-medium text-texte-doux">({exonerations.length})</span>
          {exonere && <span className="ml-2 text-base font-medium text-texte-doux">· non perçu : {exonere}</span>}
        </h2>
        {exonerations.length === 0 ? (
          <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucune exonération aujourd&apos;hui.</p>
        ) : (
          <ul>
            {exonerations.map((x) => (
              <li key={x.acte.id} data-exoneration={x.acte.identifiant} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] px-5 py-3.5">
                <span className="flex min-w-0 flex-col">
                  <span>
                    <span className="text-texte-doux">{heureUvira(x.accordeLe)}</span> ·{" "}
                    <Link href={`/caissier/actes/${x.acte.id}`} className="font-mono font-semibold">
                      {x.acte.identifiant}
                    </Link>{" "}
                    · {x.acte.titulaire}
                  </span>
                  <span className="text-[15px] text-texte-doux">Motif : {x.motif}</span>
                </span>
                <span className="font-semibold">{formaterMontant(x.montant, x.devise)} non perçus</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CadreEspace>
  );
}
