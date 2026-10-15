import { CodeActe } from "@/components/code-acte";
import { FAMILLES } from "@/lib/charte";
import { MODELES_FICHE, type LigneCatalogue } from "@/lib/catalogue";
import { formaterDate, formaterMontant, type Prix } from "@/lib/tarifs";
import { ActionsType } from "./actions-type";

const cellule = "border-b border-[#edf0f5] px-4 py-3 align-top";
const prix = (p: Prix | null) => (p ? formaterMontant(p.montant, p.devise) : null);

/** Le catalogue des actes : au catalogue (normal) ou retiré (grisé). */
export function TableauCatalogue({ lignes }: { lignes: LigneCatalogue[] }) {
  return (
    <section aria-labelledby="titre-catalogue" className="min-w-0 overflow-hidden rounded-[10px] border border-bordure bg-surface">
      <h2 id="titre-catalogue" className="sr-only">
        Types d&apos;actes
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
              {["N°", "Code", "Acte", "Fiche de détails", "Prix actuel", "État"].map((t) => (
                <th key={t} scope="col" className="border-b border-bordure px-4 py-2.5">
                  {t}
                </th>
              ))}
              <th scope="col" className="border-b border-bordure px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ acte, national, etranger, disponibleLe }) => (
              <tr key={acte.id} data-type={acte.code} data-etat={acte.actif ? "actif" : "retire"} className={acte.actif ? undefined : "bg-[#f7f8fa] text-[#6b7280]"}>
                <td className={`${cellule} font-mono text-sm`}>{String(acte.numero).padStart(2, "0")}</td>
                <td className={cellule}>
                  <span className={acte.actif ? undefined : "opacity-50"}>
                    <CodeActe acte={acte} />
                  </span>
                </td>
                <td className={cellule}>
                  <span className="flex flex-col">
                    <span>{acte.libelle}</span>
                    <span className="text-sm text-texte-doux">{FAMILLES[acte.famille].libelle}</span>
                  </span>
                </td>
                <td className={`${cellule} text-[15px]`}>{MODELES_FICHE[acte.modele_fiche].split(" (")[0]}</td>
                <td className={`${cellule} whitespace-nowrap`}>
                  {national ? (
                    <span className="flex flex-col">
                      <span>{acte.tarif_distinct_etranger ? `National : ${prix(national)}` : prix(national)}</span>
                      {acte.tarif_distinct_etranger && <span>Étranger : {prix(etranger) ?? "—"}</span>}
                    </span>
                  ) : disponibleLe ? (
                    <span className="rounded-md bg-attention-fond px-2 py-[3px] text-sm font-bold text-attention-texte">
                      Disponible le {formaterDate(disponibleLe)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={cellule}>
                  <span
                    className={`rounded-full px-2.5 py-[3px] text-sm font-bold whitespace-nowrap ${
                      acte.actif ? "bg-succes-fond text-succes-texte" : "bg-[#eef0f3] text-[#374151]"
                    }`}
                  >
                    {acte.actif ? "Au catalogue" : "Retiré"}
                  </span>
                </td>
                <td className={`${cellule} text-right`}>
                  <ActionsType acte={acte} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
