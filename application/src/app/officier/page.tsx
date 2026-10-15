import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { ActesAScanner } from "@/components/actes-a-scanner";
import { Icone } from "@/components/icone";
import { BarreRecherche } from "@/components/recherche-actes";
import { exigerEspace } from "@/lib/acces";
import { libelleStatut, lireAccueilOfficier, prenomAffiche } from "@/lib/accueil-officier";
import { STATUTS } from "@/lib/charte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { heureUvira } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterDate } from "@/lib/tarifs";

export const metadata: Metadata = { title: "Accueil — Officier" };

/** Accueil de l'officier (fichier 30), d'après la maquette « Officier — Accueil ». */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Accueil />
    </Suspense>
  );
}

function Tuile({ libelle, valeur, alerte = false }: { libelle: string; valeur: number; alerte?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[10px] border px-[22px] py-5 ${
        alerte ? "border-[#e8c766] bg-attention-fond text-attention-texte" : "border-bordure bg-surface"
      }`}
    >
      <span className={`text-[15px] ${alerte ? "font-semibold" : "text-texte-doux"}`}>{libelle}</span>
      <span className="text-[38px] leading-tight font-bold">{valeur}</span>
    </div>
  );
}

async function Accueil() {
  const agent = await exigerEspace("officier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité de l'officier introuvable.");
  const aujourdhui = aujourdhuiUvira();
  const accueil = await lireAccueilOfficier(supabase, entite.id, aujourdhui);
  const { compteurs } = accueil;

  return (
    <CadreEspace agent={agent} actif="/officier">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-[34px] font-bold">Bonjour {prenomAffiche(agent.profil.nomComplet)}</h1>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/officier/scanner"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-bleu-etat bg-surface px-[22px] text-[17px] font-bold text-bleu-etat hover:bg-bleu-clair"
          >
            <Icone nom="scanner" />
            Scanner un acte
          </Link>
          <Link
            href="/officier/actes/nouveau"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-bleu-etat px-[22px] text-[17px] font-bold text-white hover:bg-bleu-etat-fonce"
          >
            <Icone nom="plus" />
            Nouvel acte
          </Link>
        </div>
      </div>

      <BarreRecherche action="/officier/recherche" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="compteurs">
        <Tuile libelle="Enregistrés aujourd'hui" valeur={compteurs.enregistres} />
        <Tuile libelle="En attente de paiement" valeur={compteurs.enAttente} />
        <Tuile libelle="Renvoyés pour correction" valeur={compteurs.renvoyes} />
        <Tuile libelle="Payés, à scanner avant la clôture" valeur={compteurs.aScanner} alerte={compteurs.aScanner > 0} />
      </div>

      <ActesAScanner actes={accueil.aScanner} depuis="accueil" />

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="titre-renvoyes" className="min-w-0 flex-[1_1_420px] overflow-hidden rounded-[10px] border border-bordure bg-surface">
          <h2 id="titre-renvoyes" className="px-5 py-[18px] text-xl font-bold">
            Renvoyés par le Caissier
          </h2>
          {accueil.renvoyes.length === 0 ? (
            <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun acte à corriger.</p>
          ) : (
            <ul>
              {accueil.renvoyes.map((r) => (
                <li key={r.id} data-renvoye={r.identifiant} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] px-5 py-3.5">
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <Link href={`/officier/actes/${r.id}`} className="font-mono font-semibold">
                      {r.identifiant}
                    </Link>
                    <span>
                      {r.titulaire}
                      {r.renvoyeLe &&
                        ` · renvoyé ${aujourdhuiUvira(new Date(r.renvoyeLe)) === aujourdhui ? "" : `le ${formaterDate(aujourdhuiUvira(new Date(r.renvoyeLe)))} `}à ${heureUvira(r.renvoyeLe)}`}
                      {r.par && ` par ${r.par}`}
                    </span>
                    <span className="rounded-lg bg-attention-fond px-3 py-2 text-attention-texte">Motif : « {r.motif} »</span>
                  </div>
                  <Link
                    href={`/officier/actes/${r.id}/corriger`}
                    aria-label={`Corriger ${r.identifiant}`}
                    className="inline-flex h-11 items-center rounded-lg border border-bleu-etat px-[18px] font-bold text-bleu-etat hover:bg-bleu-clair"
                  >
                    Corriger
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titre-derniers" className="min-w-0 flex-[1_1_420px] overflow-hidden rounded-[10px] border border-bordure bg-surface">
          <h2 id="titre-derniers" className="px-5 py-[18px] text-xl font-bold">
            Derniers actes du jour
          </h2>
          {accueil.derniers.length === 0 ? (
            <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">Aucun acte enregistré aujourd&apos;hui.</p>
          ) : (
            <ul>
              {accueil.derniers.map((a) => {
                const statut = STATUTS[a.statut];
                return (
                  <li key={a.id} data-dernier={a.identifiant} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f5] px-5 py-3">
                    <Link href={`/officier/actes/${a.id}`} className="font-mono font-semibold no-underline hover:underline">
                      {a.identifiant}
                    </Link>
                    <span className="rounded-full px-2.5 py-1 text-sm font-bold" style={{ background: statut.fond, color: statut.texte }}>
                      {libelleStatut(a.statut, a.scanne)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </CadreEspace>
  );
}
