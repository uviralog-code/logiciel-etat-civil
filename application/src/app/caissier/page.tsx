import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BandeauTaux } from "@/components/bandeau-taux";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { annonceRetour, etatJournee, lireAccueilCaissier, momentTransmission, obstacleEncaissement, texteAnnules } from "@/lib/accueil-caissier";
import { exigerEspace } from "@/lib/acces";
import { peutRevenirEnFile } from "@/lib/recus-du-jour";
import { dateDuJour } from "@/lib/espaces";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { etatTauxDuJour, heureUvira, lireHistoriqueTaux } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterMontant } from "@/lib/tarifs";
import { Annonces } from "./actualisation";
import { BoutonAnnulerRecu } from "./bouton-annuler-recu";
import { FileAEncaisser } from "./file-a-encaisser";

export const metadata: Metadata = { title: "Accueil — Caisse" };

/** Accueil du caissier (fichier 37), d'après la maquette « Caissier — Accueil ». */
export default function Page({ searchParams }: PageProps<"/caissier">) {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <AccueilCaissier parametres={searchParams} />
    </Suspense>
  );
}

function Tuile({ libelle, valeur, note }: { libelle: string; valeur: string; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-bordure bg-surface px-[22px] py-5">
      <span className="text-[15px] text-texte-doux">{libelle}</span>
      <strong className="text-[30px] leading-tight font-bold break-words sm:text-[34px]">{valeur}</strong>
      {note && <span className="text-[15px] text-erreur-texte">{note}</span>}
    </div>
  );
}


async function AccueilCaissier({ parametres }: { parametres: PageProps<"/caissier">["searchParams"] }) {
  const agent = await exigerEspace("caissier");
  // Retour de l'écran d'encaissement : « MUL-… a été exonéré », « … renvoyé »
  const annonce = annonceRetour(await parametres);
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const aujourdhui = aujourdhuiUvira();
  const [accueil, [dernierTaux]] = await Promise.all([
    lireAccueilCaissier(supabase, entite.id, aujourdhui),
    lireHistoriqueTaux(supabase, entite.id, 1),
  ]);
  const taux = etatTauxDuJour(dernierTaux ?? null);
  const { chiffres, aEncaisser, derniersRecus, clotureLe } = accueil;

  return (
    <CadreEspace
      agent={agent}
      actif="/caissier"
      bandeau={<BandeauTaux etat={taux} />}
      enTete={
        <span className="text-texte-doux" data-testid="etat-journee">
          {dateDuJour()} · {etatJournee(clotureLe)}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="chiffres-du-jour">
        <Tuile libelle="Encaissé en dollars" valeur={formaterMontant(chiffres.usd, "USD")} />
        <Tuile libelle="Encaissé en francs" valeur={formaterMontant(chiffres.cdf, "CDF")} />
        <Tuile libelle="Total en équivalent FC" valeur={formaterMontant(chiffres.equivalentCdf, "CDF")} />
        <Tuile libelle="Reçus émis" valeur={String(chiffres.recusEmis)} note={texteAnnules(chiffres.recusAnnules)} />
      </div>

      {/* Nouvelle annonce à chaque retour (l'écran reste en mémoire entre deux visites) */}
      <Annonces key={annonce ?? ""} initial={annonce} />

      <FileAEncaisser
        luA={heureUvira(new Date())}
        lignes={aEncaisser.map((a) => ({
          acte: {
            id: a.id,
            identifiant: a.identifiant,
            type: a.type,
            titulaire: a.titulaire,
            categorie: a.categorie,
          },
          transmis: momentTransmission(a.transmisLe, aujourdhui),
          montant: formaterMontant(a.montant, a.devise),
          obstacle: obstacleEncaissement(a, taux, clotureLe),
        }))}
      />

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="titre-recus" className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-[10px] border border-bordure bg-surface">
          <h2 id="titre-recus" className="px-5 py-[18px] text-xl font-bold">
            Derniers reçus
          </h2>
          {derniersRecus.length === 0 ? (
            <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun reçu émis aujourd&apos;hui.</p>
          ) : (
            <ul>
              {derniersRecus.map((r) => {
                const annule = r.statut === "annule";
                return (
                  <li
                    key={r.id}
                    data-recu={r.numero}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] px-5 py-3"
                  >
                    <span className={`flex min-w-0 flex-col ${annule ? "text-[#6b7280] line-through" : ""}`}>
                      <Link href={`/caissier/recus/${r.id}`} className={`font-mono text-[15px] font-semibold ${annule ? "text-[#6b7280]" : ""}`}>
                        {r.numero}
                      </Link>
                      <span className="text-sm text-texte-doux">
                        {r.acteIdentifiant} · {heureUvira(r.encaisseLe)}
                      </span>
                    </span>
                    <span className={annule ? "text-[#6b7280] line-through" : "font-semibold"}>{formaterMontant(r.montant, r.devise)}</span>
                    {annule ? (
                      <span className="rounded-full bg-erreur-fond px-2.5 py-1 text-sm font-bold text-erreur-texte">
                        Annulé
                        {r.motifAnnulation ? ` · ${r.motifAnnulation}` : ""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span className="rounded-full bg-succes-fond px-2.5 py-1 text-sm font-bold text-succes-texte">Valide</span>
                        {/* Après la clôture, un reçu ne s'annule plus (fichier 05) */}
                        {!clotureLe && (
                          <BoutonAnnulerRecu
                            recu={{
                              id: r.id,
                              numero: r.numero,
                              montant: formaterMontant(r.montant, r.devise),
                              acte: r.acteIdentifiant,
                              titulaire: r.acteTitulaire,
                              peutRevenirEnFile: r.acteStatut != null && peutRevenirEnFile(r.acteStatut),
                            }}
                          />
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="titre-fin"
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-[22px]"
        >
          <h2 id="titre-fin" className="text-xl font-bold">
            Fin de journée
          </h2>
          {clotureLe ? (
            <p className="rounded-lg bg-succes-fond px-3.5 py-2.5 font-semibold text-succes-texte" data-testid="journee-cloturee">
              Journée clôturée à {heureUvira(clotureLe)}. Plus aucun encaissement aujourd&apos;hui : un usager qui se présente paiera demain.
            </p>
          ) : (
            <>
              <p className="leading-relaxed text-[#374151]">
                Comptez l&apos;argent en caisse, puis clôturez. Une fois clôturée, la journée ne peut plus être modifiée.
              </p>
              <Link
                href="/caissier/cloture"
                className="flex h-[52px] items-center justify-center rounded-lg bg-bleu-etat text-[17px] font-bold text-white no-underline hover:bg-bleu-etat-fonce hover:text-white"
              >
                Clôturer la caisse
              </Link>
            </>
          )}
        </section>
      </div>
    </CadreEspace>
  );
}
