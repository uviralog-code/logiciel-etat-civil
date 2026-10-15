import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { ecart, lireActesSansScan, lireClotureFaite, type ActeSansScan } from "@/lib/cloture";
import { dateDuJour } from "@/lib/espaces";
import { lireJourneeCaisse } from "@/lib/recus-du-jour";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterDate, formaterMontant } from "@/lib/tarifs";
import { RelireAuRetour } from "../actualisation";
import { FormulaireCloture } from "./formulaire-cloture";

export const metadata: Metadata = { title: "Clôture de caisse" };

/** « Clôture de caisse » (fichier 41), d'après la maquette « Caissier — Clôture de caisse ». */
export default function Page({ searchParams }: PageProps<"/caissier/cloture">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Cloture parametres={searchParams} />
    </Suspense>
  );
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

function SansScan({ actes }: { actes: ActeSansScan[] }) {
  return (
    <section aria-labelledby="titre-sans-scan" className="flex flex-col gap-3 rounded-[10px] border border-[#e8c766] bg-attention-fond p-5 text-attention-texte">
      <div className="flex flex-col">
        <h2 id="titre-sans-scan" className="text-lg font-bold">
          Actes payés aujourd&apos;hui sans scan ({actes.length})
        </h2>
        <span className="text-[15px]">Signalés à l&apos;administrateur, sans bloquer la clôture</span>
      </div>
      {actes.length === 0 ? (
        <p className="font-semibold">Tous les actes payés aujourd&apos;hui sont scannés.</p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="actes-sans-scan">
          {actes.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2">
              <Link href={`/caissier/actes/${a.id}`} className="font-mono font-semibold text-attention-texte">
                {a.identifiant}
              </Link>
              <span>{a.titulaire}</span>
            </li>
          ))}
        </ul>
      )}
      {actes.length > 0 && <p className="text-[15px]">Rappelez à l&apos;Officier de les scanner : il peut le faire même après la clôture.</p>}
    </section>
  );
}

async function Cloture({ parametres }: { parametres: PageProps<"/caissier/cloture">["searchParams"] }) {
  const agent = await exigerEspace("caissier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const jour = aujourdhuiUvira();
  const [{ totaux }, sansScan, faite] = await Promise.all([
    lireJourneeCaisse(supabase, entite.id, jour),
    lireActesSansScan(supabase, entite.id, jour),
    lireClotureFaite(supabase, entite.id, jour),
  ]);
  const justeFaite = (await parametres).faite === "1";
  const nonPercu = [totaux.exonereUsd ? formaterMontant(totaux.exonereUsd, "USD") : null, totaux.exonereCdf ? formaterMontant(totaux.exonereCdf, "CDF") : null]
    .filter(Boolean)
    .join(" et ");
  const resume = [
    `${pluriel(totaux.valides + totaux.annules, "reçu")} émis aujourd'hui${totaux.annules ? `, dont ${pluriel(totaux.annules, "annulé")}` : ""}`,
    totaux.exonerations ? `${pluriel(totaux.exonerations, "exonération")}${nonPercu ? ` (${nonPercu} non perçus)` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CadreEspace agent={agent} actif="/caissier/cloture" enTete={<span className="text-texte-doux">Journée du {dateDuJour().toLowerCase()}</span>}>
      <RelireAuRetour />
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[30px] font-bold">Clôture de la caisse</h1>
        <p className="text-lg text-texte-doux" data-testid="resume-journee">
          {resume}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_620px]">
          {faite ? (
            <section className="flex flex-col gap-4 rounded-[10px] border-2 border-[#2e7d32] bg-surface p-6" data-testid="cloture-faite">
              <p role="status" className="rounded-lg bg-succes-fond px-4 py-3 text-lg font-bold text-succes-texte">
                {justeFaite ? "Clôture enregistrée. " : ""}Journée du {formaterDate(jour)} clôturée à {heureUvira(faite.clotureLe)}
                {faite.par ? ` par ${faite.par}` : ""}.
              </p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-5 gap-y-2 text-[17px]">
                <span />
                <dt className="font-bold text-texte-doux">Attendu</dt>
                <dt className="font-bold text-texte-doux">Compté</dt>
                <dt className="font-bold text-texte-doux">Écart</dt>
                {(["USD", "CDF"] as const).map((d) => {
                  const a = d === "USD" ? faite.attenduUsd : faite.attenduCdf;
                  const c = d === "USD" ? faite.compteUsd : faite.compteCdf;
                  const e = ecart(c, a, d);
                  return (
                    <div key={d} className="contents">
                      <dt className="font-bold">{d === "USD" ? "Dollars" : "Francs"}</dt>
                      <dd>{formaterMontant(a, d)}</dd>
                      <dd>{formaterMontant(c, d)}</dd>
                      <dd className={`font-bold ${e.etat === "juste" ? "text-succes-texte" : "text-erreur-texte"}`}>{e.texte}</dd>
                    </div>
                  );
                })}
              </dl>
              {faite.explication && (
                <p className="rounded-lg bg-attention-fond px-4 py-3 text-attention-texte">
                  <strong>Explication de l&apos;écart :</strong> {faite.explication}
                </p>
              )}
              <p className="text-texte-doux">
                La journée est verrouillée : plus aucun encaissement, exonération ni annulation de reçu aujourd&apos;hui. Les usagers qui se présentent paieront
                demain.
              </p>
            </section>
          ) : (
            <FormulaireCloture attenduUsd={totaux.usd} attenduCdf={totaux.cdf} dateCourte={formaterDate(jour)} />
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <SansScan actes={sansScan} />
          <section className="flex flex-col gap-1 rounded-[10px] border border-bordure bg-surface p-5">
            <span className="text-texte-doux">Total de la journée</span>
            <strong className="text-[30px]" data-testid="total-journee">
              {formaterMontant(totaux.equivalentCdf, "CDF")}
            </strong>
            <span className="text-[15px] text-texte-doux">en équivalent francs, au taux de chaque paiement</span>
          </section>
        </aside>
      </div>
    </CadreEspace>
  );
}
