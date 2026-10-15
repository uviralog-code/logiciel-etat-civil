import { nomCourt } from "@/lib/comptes";
import { LIBELLE_CATEGORIE } from "@/lib/grille-commune";
import { texteChangement, type LigneTarifsEntite } from "@/lib/tarifs-entite";
import { formaterDate, formaterMontant } from "@/lib/tarifs";

const cellule = "border-b border-[#edf0f5] px-4 py-3";

/**
 * Tableau « Grille commune / Tarif appliqué » d'une entité (maquette « Officier —
 * Tarifs de l'entité ») : un ajustement en vigueur est signalé en bleu, un
 * changement à venir en jaune. Servi à l'officier et, en lecture seule, au caissier.
 */
export function TableauTarifsEntite({ lignes, nomEntite }: { lignes: LigneTarifsEntite[]; nomEntite: string }) {
  return (
    <section
      aria-labelledby="titre-tarifs"
      className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-[10px] border border-bordure bg-surface"
    >
      <h2 id="titre-tarifs" className="sr-only">
        Tarifs appliqués
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
              <th scope="col" className="border-b border-bordure px-4 py-2.5">N°</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Acte</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Grille commune</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Tarif appliqué à {nomCourt(nomEntite)}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const fond = l.changements.length > 0 ? "bg-[#fff8e6]" : l.ajustement ? "bg-[#eef3fb]" : undefined;
              return (
                <tr key={l.cle} data-ligne={`${l.acte.code}-${l.categorie}`} className={fond}>
                  <td className={`${cellule} font-mono text-sm text-texte-doux`}>{String(l.acte.numero).padStart(2, "0")}</td>
                  <td className={cellule}>
                    {l.acte.libelle}
                    {l.distinct && <span className="text-texte-doux"> ({LIBELLE_CATEGORIE[l.categorie].toLowerCase()})</span>}
                  </td>
                  <td className={`${cellule} whitespace-nowrap`}>{l.commun ? formaterMontant(l.commun.montant, l.commun.devise) : "—"}</td>
                  <td className={cellule}>
                    <span className="flex flex-col items-start gap-1">
                      <span className={l.ajustement ? "font-bold" : undefined}>
                        {l.applique ? formaterMontant(l.applique.montant, l.applique.devise) : "—"}
                      </span>
                      {l.ajustement && (
                        <span className="rounded-md bg-bleu-clair px-2 py-[3px] text-sm font-bold text-bleu-etat">
                          Ajusté depuis le {formaterDate(l.ajustement.depuis)}
                        </span>
                      )}
                      {l.changements.map((c) => (
                        <span key={c.date} className="rounded-md bg-attention-fond px-2 py-[3px] text-sm font-bold text-attention-texte">
                          {texteChangement(c)}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
