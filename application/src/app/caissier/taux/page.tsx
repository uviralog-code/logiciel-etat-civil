import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { exigerEspace } from "@/lib/acces";
import { nomCourt } from "@/lib/comptes";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { ecartAvec, etatTauxDuJour, formaterEcart, formaterNombreTaux, heureUvira, lireHistoriqueTaux, type EtatTaux } from "@/lib/taux";
import { aujourdhuiUvira, formaterDate } from "@/lib/tarifs";
import { lireEntite } from "@/lib/tarifs-entite";
import { FormulaireTaux } from "./formulaire-taux";

export const metadata: Metadata = { title: "Taux du jour" };

/** Taux du jour du caissier (fichier 26). */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Taux />
    </Suspense>
  );
}

function TauxEnVigueur({ etat }: { etat: EtatTaux }) {
  if (etat.type === "du-jour") {
    return (
      <div data-testid="taux-en-vigueur" className="flex flex-col gap-1 rounded-lg border border-[#c5d4ee] bg-bleu-clair px-4 py-3.5">
        <span className="text-[15px] font-semibold text-bleu-etat">Taux en vigueur</span>
        <span className="text-[28px] font-bold">{formaterNombreTaux(etat.taux)} FC pour 1 $</span>
        <span className="text-texte-doux">Saisi aujourd&apos;hui à {etat.heure}</span>
      </div>
    );
  }
  return (
    <div data-testid="taux-en-vigueur" role="alert" className="flex flex-col gap-1 rounded-lg bg-erreur-fond px-4 py-3.5 text-erreur-texte">
      <strong className="text-lg">Aucun taux saisi aujourd&apos;hui.</strong>
      <span>
        {etat.type === "ancien"
          ? `Le dernier taux (${formaterNombreTaux(etat.taux)} FC pour 1 $, saisi le ${etat.date}) s'applique encore. Saisissez celui du jour.`
          : "Les actes en dollars ne peuvent pas être encaissés tant qu'aucun taux n'est saisi."}
      </span>
    </div>
  );
}

async function Taux() {
  const agent = await exigerEspace("caissier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const historique = await lireHistoriqueTaux(supabase, entite.id, 31);
  const etat = etatTauxDuJour(historique[0] ?? null);
  const aujourdhui = aujourdhuiUvira();
  const cellule = "border-b border-[#edf0f5] px-4 py-3";

  return (
    <CadreEspace agent={agent} actif="/caissier/taux">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[34px] font-bold">Taux du jour</h1>
        <p className="max-w-3xl text-[17px] text-texte-doux">
          Le nombre de francs congolais pour 1 dollar, à {nomCourt(entite.nom)}. Il s&apos;applique dès qu&apos;il est
          enregistré ; les reçus déjà émis gardent le taux de leur paiement.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <section
          aria-label="Taux du jour"
          className="flex min-w-0 flex-[1_1_380px] flex-col gap-6 rounded-[10px] border border-bordure bg-surface p-6"
        >
          <TauxEnVigueur etat={etat} />
          <FormulaireTaux precedent={historique[0]?.taux ?? null} />
        </section>

        <section aria-labelledby="titre-historique" className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          <h2 id="titre-historique" className="text-xl font-bold">
            Historique des taux
          </h2>
          {historique.length === 0 ? (
            <p className="text-texte-doux">Aucun taux n&apos;a encore été saisi.</p>
          ) : (
            <div className="relative overflow-x-auto rounded-[10px] border border-bordure bg-surface">
              <table className="w-full min-w-[440px] border-collapse">
                <thead>
                  <tr className="text-left text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase">
                    <th scope="col" className="border-b border-bordure px-4 py-2.5">Date</th>
                    <th scope="col" className="border-b border-bordure px-4 py-2.5">Heure</th>
                    <th scope="col" className="border-b border-bordure px-4 py-2.5 text-right">FC pour 1 $</th>
                    <th scope="col" className="border-b border-bordure px-4 py-2.5 text-right">Variation</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.slice(0, 30).map((l, i) => {
                    const jour = aujourdhuiUvira(new Date(l.en_vigueur_depuis));
                    const ecart = ecartAvec(l.taux, historique[i + 1]?.taux ?? null);
                    return (
                      <tr key={l.id} data-taux className={i === 0 ? "font-semibold" : undefined}>
                        <td className={cellule}>{jour === aujourdhui ? "Aujourd'hui" : formaterDate(jour)}</td>
                        <td className={cellule}>{heureUvira(l.en_vigueur_depuis)}</td>
                        <td className={`${cellule} text-right font-mono`}>{formaterNombreTaux(l.taux)}</td>
                        <td className={`${cellule} text-right text-texte-doux`}>
                          {ecart == null ? "—" : ecart === 0 ? "=" : formaterEcart(ecart)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-texte-doux">Les 30 dernières saisies. Un taux enregistré ne se modifie pas : on en saisit un nouveau.</p>
        </section>
      </div>
    </CadreEspace>
  );
}
