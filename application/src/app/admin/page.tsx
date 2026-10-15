import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { dateDuJour } from "@/lib/espaces";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { deMois, lireTableauAdmin, pourcentage, texteEcart, type EtatCaisseHier, type LigneEntite } from "@/lib/tableau-admin";
import { heureUvira } from "@/lib/taux";
import { formaterMontant, formaterTaux } from "@/lib/tarifs";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Tableau de bord de l'administrateur, d'après la maquette « Admin — Tableau de bord ». */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <TableauDeBord />
    </Suspense>
  );
}

const FC = (m: number) => formaterMontant(m, "CDF");

function Tuile({ titre, valeur, note, alerte = false, testid }: { titre: string; valeur: string; note: string; alerte?: boolean; testid: string }) {
  return (
    <div
      data-testid={testid}
      className={`flex min-w-0 flex-col gap-1.5 rounded-[10px] border px-[22px] py-5 ${alerte ? "border-[#e8a3a3] bg-erreur-fond text-erreur-texte" : "border-bordure bg-surface"}`}
    >
      <span className={`text-[15px] ${alerte ? "font-semibold" : "text-texte-doux"}`}>{titre}</span>
      <strong className="text-[30px] leading-tight font-bold break-words">{valeur}</strong>
      <span className={`text-[15px] ${alerte ? "" : "text-texte-doux"}`}>{note}</span>
    </div>
  );
}

const CAISSE: Record<EtatCaisseHier, { texte: string; classe: string }> = {
  cloturee: { texte: "Clôturée", classe: "bg-succes-fond text-succes-texte" },
  non_cloturee: { texte: "Non clôturée", classe: "bg-erreur-fond text-erreur-texte" },
  sans_activite: { texte: "Sans activité", classe: "bg-[#eef1f5] text-texte-doux" },
};

function Taux({ l }: { l: LigneEntite }) {
  if (!l.taux) return <span className="font-semibold text-erreur-texte">Aucun</span>;
  return (
    <span className={l.taux.duJour ? "" : "text-attention-texte"}>
      {formaterTaux(l.taux.valeur).replace(" pour 1 $", "")}
      <span className="block text-sm text-texte-doux">{l.taux.duJour ? `à ${l.taux.quand}` : `ancien : ${l.taux.quand}`}</span>
    </span>
  );
}

async function TableauDeBord() {
  const agent = await exigerEspace("admin");
  const t = await lireTableauAdmin(await creerClientServeur());
  const { total } = t;
  const mois = t.libelleMois.charAt(0).toUpperCase() + t.libelleMois.slice(1);
  const max = Math.max(1, ...t.entites.map((e) => e.recettesMois));
  const variation =
    total.variationMoisPct == null ? "pas de comparaison avec le mois précédent" : `${total.variationMoisPct >= 0 ? "+" : "−"}${pourcentage(Math.abs(total.variationMoisPct))} par rapport au mois précédent`;
  const classeEcart = (usd: number, cdf: number) => (usd < 0 || cdf < 0 ? "text-erreur-texte font-semibold" : usd > 0 || cdf > 0 ? "text-attention-texte font-semibold" : "");

  return (
    <CadreEspace agent={agent} actif="/admin" enTete={<span className="text-texte-doux">{dateDuJour()} · {heureUvira(new Date())}</span>}>
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[30px] font-bold">Les 4 entités aujourd&apos;hui</h1>
        <p className="text-lg text-texte-doux">Mulongwe, Kavimvira, Kalundu et la chefferie des Bavira</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile testid="tuile-jour" titre="Recettes du jour (4 entités)" valeur={FC(total.recettesJour)} note="en équivalent francs" />
        <Tuile testid="tuile-mois" titre={`Recettes ${deMois(t.libelleMois)}`} valeur={FC(total.recettesMois)} note={variation} />
        <Tuile testid="tuile-archivage" titre="Taux d'archivage global" valeur={pourcentage(total.archivagePct)} note="des actes payés sont scannés" />
        <Tuile testid="tuile-points" titre="Points à vérifier" valeur={String(t.points.length)} note={t.points.length ? "voir la liste ci-dessous" : "rien à signaler"} alerte={t.points.some((p) => p.grave)} />
      </div>

      <section aria-labelledby="titre-entites" className="overflow-hidden rounded-[10px] border border-bordure bg-surface">
        <h2 id="titre-entites" className="px-5 py-[18px] text-xl font-bold">
          Par entité
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left" data-testid="table-entites">
            <thead>
              <tr className="border-y border-bordure text-[13px] tracking-[0.05em] whitespace-nowrap text-texte-doux uppercase">
                <th className="px-4 py-2.5 font-bold">Entité</th>
                <th className="px-4 py-2.5 text-right font-bold">Recettes du jour</th>
                <th className="px-4 py-2.5 text-right font-bold">Recettes du mois</th>
                <th className="px-4 py-2.5 font-bold">Caisse d&apos;hier</th>
                <th className="px-4 py-2.5 text-right font-bold">Écarts du mois</th>
                <th className="px-4 py-2.5 text-right font-bold">Payés sans scan</th>
                <th className="px-4 py-2.5 text-right font-bold">Archivage</th>
                <th className="px-4 py-2.5 font-bold">Taux $ du jour</th>
              </tr>
            </thead>
            <tbody>
              {t.entites.map((l) => (
                <tr key={l.code} data-entite={l.code} className="border-b border-[#edf0f5]">
                  <td className="px-4 py-3.5 font-semibold">{l.nom}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{FC(l.recettesJour)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{FC(l.recettesMois)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap ${CAISSE[l.caisseHier].classe}`}>{CAISSE[l.caisseHier].texte}</span>
                  </td>
                  <td className={`px-4 py-3.5 text-right tabular-nums ${classeEcart(l.ecartMoisUsd, l.ecartMoisCdf)}`}>{texteEcart(l.ecartMoisUsd, l.ecartMoisCdf)}</td>
                  <td className={`px-4 py-3.5 text-right tabular-nums ${l.sansScan ? "font-semibold text-attention-texte" : ""}`}>{l.sansScan}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{pourcentage(l.archivagePct)}</td>
                  <td className="px-4 py-3.5">
                    <Taux l={l} />
                  </td>
                </tr>
              ))}
              <tr className="bg-[#f7f9fc] font-bold" data-entite="TOTAL">
                <td className="px-4 py-3.5">Total</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{FC(total.recettesJour)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{FC(total.recettesMois)}</td>
                <td />
                <td className={`px-4 py-3.5 text-right tabular-nums ${classeEcart(total.ecartMoisUsd, total.ecartMoisCdf)}`}>{texteEcart(total.ecartMoisUsd, total.ecartMoisCdf)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{total.sansScan}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{pourcentage(total.archivagePct)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="titre-points" className="flex min-w-0 flex-[999_1_480px] flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-5">
          <h2 id="titre-points" className="text-xl font-bold">
            Points à vérifier
          </h2>
          {t.points.length === 0 ? (
            <p className="text-texte-doux">Rien à signaler : caisses clôturées, pas d&apos;écart ce mois-ci, tous les actes payés sont scannés.</p>
          ) : (
            <ul className="flex flex-col gap-2.5" data-testid="points">
              {t.points.map((p, i) => (
                <li key={i} className="flex items-start gap-3 border-t border-[#edf0f5] pt-2.5 first:border-t-0 first:pt-0">
                  <span
                    className={`mt-0.5 w-[92px] shrink-0 rounded-full px-2.5 py-1 text-center text-sm font-bold ${p.grave ? "bg-erreur-fond text-erreur-texte" : "bg-attention-fond text-attention-texte"}`}
                  >
                    {p.sujet}
                  </span>
                  <span className="min-w-0">
                    <strong>{p.entite}</strong> {p.texte}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-graphique" className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-5">
          <h2 id="titre-graphique" className="text-xl font-bold">
            Recettes {deMois(t.libelleMois)} par entité
          </h2>
          <div
            role="img"
            aria-label={`Recettes ${deMois(t.libelleMois)} : ${t.entites.map((e) => `${e.nomCourt} ${FC(e.recettesMois)}`).join(", ")}`}
            className="flex flex-col gap-3"
            data-testid="graphique-mois"
          >
            {t.entites.map((e) => (
              <div key={e.code} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3" title={`${e.nom} : ${FC(e.recettesMois)} en ${t.libelleMois}`}>
                <span className="text-[15px]">{e.nomCourt}</span>
                <div className="h-4 rounded-r-[4px] bg-bleu-etat" style={{ width: `${Math.max(e.recettesMois ? 2 : 0, (100 * e.recettesMois) / max)}%` }} />
                <span className="text-[15px] font-semibold tabular-nums">{new Intl.NumberFormat("fr-FR").format(e.recettesMois)}</span>
              </div>
            ))}
          </div>
          <span className="text-sm text-texte-doux">en francs, équivalent au taux de chaque paiement · {mois}</span>
        </section>
      </div>
    </CadreEspace>
  );
}
