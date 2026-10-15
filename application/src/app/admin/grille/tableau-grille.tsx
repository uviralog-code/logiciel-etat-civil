import { CodeActe } from "@/components/code-acte";
import type { Entite } from "@/lib/comptes";
import { ecartsDesEntites } from "@/lib/grille-commune";
import { calculerGrille, formaterDate, formaterMontant, type DonneesTarifaires, type TarifCategorie } from "@/lib/tarifs";

const cellule = "border-b border-[#edf0f5] px-4 py-3";

/** Prix de la grille commune aujourd'hui, et le prochain changement programmé (s'il y en a un). */
function Prix({ tarif }: { tarif: TarifCategorie | undefined }) {
  if (!tarif) return <span className="text-[#6b7280]">—</span>;
  const prochain = tarif.communsAVenir[0];
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="whitespace-nowrap">{tarif.commun ? formaterMontant(tarif.commun.montant, tarif.commun.devise) : "—"}</span>
      {prochain && (
        <span className="text-sm font-semibold whitespace-nowrap text-bleu-etat" data-prochain>
          → {formaterMontant(prochain.montant, prochain.devise)} dès le {formaterDate(prochain.en_vigueur_depuis)}
        </span>
      )}
    </span>
  );
}

/**
 * Grille commune (maquette « Admin — Grille commune ») : tous les actes du catalogue,
 * prix National et Étranger, changements programmés en bleu, écarts des entités en jaune.
 */
export function TableauGrille({ donnees, entites, aujourdhui }: { donnees: DonneesTarifaires; entites: Entite[]; aujourdhui: string }) {
  // La grille commune seule (sans ajustement) : c'est ce que voit l'administrateur
  const grille = calculerGrille(donnees.actes, donnees.communs, [], aujourdhui);
  return (
    <section
      aria-labelledby="titre-grille"
      className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[10px] border border-bordure bg-surface"
    >
      <h2 id="titre-grille" className="sr-only">
        Grille commune en vigueur
      </h2>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
              <th scope="col" className="border-b border-bordure px-4 py-2.5">N°</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Code</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Acte</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5 text-right">National</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5 text-right">Étranger</th>
              <th scope="col" className="border-b border-bordure px-4 py-2.5">Écarts des entités</th>
            </tr>
          </thead>
          <tbody>
            {grille.map(({ acte, categories }) => {
              const ecarts = ecartsDesEntites(acte, entites, donnees.ajustements, aujourdhui);
              return (
                <tr key={acte.id} data-acte={acte.code} className={ecarts.length > 0 ? "bg-[#fff8e6]" : undefined}>
                  <td className={`${cellule} font-mono text-sm text-texte-doux`}>{String(acte.numero).padStart(2, "0")}</td>
                  <td className={cellule}>
                    <CodeActe acte={acte} />
                  </td>
                  <td className={cellule}>{acte.libelle}</td>
                  <td className={`${cellule} text-right`}>
                    <Prix tarif={categories.find((c) => c.categorie === "national")} />
                  </td>
                  <td className={`${cellule} text-right`}>
                    <Prix tarif={categories.find((c) => c.categorie === "etranger")} />
                  </td>
                  <td className={cellule}>
                    <span className="flex flex-wrap gap-1.5">
                      {ecarts.map((e) => (
                        <span
                          key={e.texte}
                          className="rounded-full bg-attention-fond px-2.5 py-[3px] text-sm font-semibold whitespace-nowrap text-attention-texte"
                        >
                          {e.texte}
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
