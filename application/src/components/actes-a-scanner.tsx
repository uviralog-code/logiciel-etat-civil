import Link from "next/link";
import type { AccueilOfficier } from "@/lib/accueil-officier";
import { FAMILLES } from "@/lib/charte";
import { heureUvira } from "@/lib/taux";
import { formaterDate } from "@/lib/tarifs";

const cellule = "border-b border-[#edf0f5] px-4 py-3.5";

/**
 * Actes payés ou exonérés qui attendent leur scan (accueil de l'officier et
 * écran « Scanner ») : les oublis des jours précédents d'abord, en jaune.
 */
export function ActesAScanner({ actes, depuis }: { actes: AccueilOfficier["aScanner"]; depuis: "accueil" | "liste" }) {
  return (
    <section aria-labelledby={`titre-a-scanner-${depuis}`} className="min-w-0 overflow-hidden rounded-[10px] border border-bordure bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-[18px]">
        <h2 id={`titre-a-scanner-${depuis}`} className="text-xl font-bold">
          À scanner avant la clôture de caisse
        </h2>
        <span className="text-[15px] text-attention-texte">Sinon, l&apos;oubli sera signalé à l&apos;administrateur</span>
      </div>
      {actes.length === 0 ? (
        <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun acte payé n&apos;attend son scan. Tout est archivé.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                {["ID de l'acte", "Type", "Titulaire", "Payé"].map((t) => (
                  <th key={t} scope="col" className="border-y border-bordure px-4 py-2.5">
                    {t}
                  </th>
                ))}
                <th scope="col" className="border-y border-bordure px-4 py-2.5">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {actes.map((a) => (
                <tr key={a.id} data-a-scanner={a.identifiant} className={a.enRetard ? "bg-[#fff8e6]" : undefined}>
                  <td className={`${cellule} font-mono text-[15px] font-semibold`}>
                    <Link href={`/officier/actes/${a.id}`} className="no-underline hover:underline">
                      {a.identifiant}
                    </Link>
                  </td>
                  <td className={cellule}>
                    <span
                      className="inline-block rounded-md px-2.5 py-1 text-sm font-bold text-white"
                      style={{ background: a.type.couleur ?? FAMILLES[a.type.famille].couleur }}
                    >
                      {a.type.libelle}
                    </span>
                  </td>
                  <td className={cellule}>
                    {a.titulaire}
                    {a.categorie === "etranger" && <span className="text-texte-doux"> (étranger)</span>}
                  </td>
                  <td className={`${cellule} whitespace-nowrap`}>
                    {a.enRetard && a.journee ? (
                      <strong className="text-attention-texte">le {formaterDate(a.journee)} — en retard</strong>
                    ) : a.payeLe ? (
                      `à ${heureUvira(a.payeLe)}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${cellule} text-right`}>
                    <Link
                      href={`/officier/actes/${a.id}/scanner?depuis=${depuis}`}
                      aria-label={`Scanner ${a.identifiant}`}
                      className="inline-flex h-11 items-center rounded-lg bg-bleu-etat px-[18px] font-bold text-white no-underline hover:bg-bleu-etat-fonce"
                    >
                      Scanner
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
