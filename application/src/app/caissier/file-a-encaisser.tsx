"use client";

import Link from "next/link";
import { useState } from "react";
import { texteFile, type ActeAEncaisser } from "@/lib/accueil-caissier";
import { FAMILLES } from "@/lib/charte";
import { Actualisation } from "./actualisation";
import { BoutonRenvoyer } from "./bouton-renvoyer";

export interface LigneFile {
  acte: Pick<ActeAEncaisser, "id" | "identifiant" | "type" | "titulaire" | "categorie">;
  /** « 08 h 15 » (préparé par le serveur, à l'heure d'Uvira). */
  transmis: string;
  /** « 30 $ » */
  montant: string;
  /** Pourquoi l'acte ne peut pas être encaissé maintenant (journée clôturée, pas de taux). */
  obstacle: string | null;
}

export const COLONNES_FILE = "lg:grid-cols-[110px_minmax(0,1.35fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_224px]";

function TypeActe({ type }: { type: ActeAEncaisser["type"] }) {
  return (
    <span
      className="inline-block rounded-md px-2.5 py-1 text-sm font-bold text-white"
      style={{
        background: type.couleur ?? FAMILLES[type.famille]?.couleur ?? "#374151",
      }}
    >
      {type.libelle}
    </span>
  );
}

/**
 * File « À encaisser » (maquette « Caissier — Accueil »). Un acte renvoyé à
 * l'Officier disparaît aussitôt, sans attendre la relecture de l'écran.
 */
export function FileAEncaisser({ lignes, luA }: { lignes: LigneFile[]; luA: string }) {
  const [renvoyes, setRenvoyes] = useState<ReadonlySet<string>>(new Set());
  const visibles = lignes.filter((l) => !renvoyes.has(l.acte.id));
  return (
    <section aria-labelledby="titre-file" className="overflow-hidden rounded-[10px] border border-bordure bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-[18px]">
        <h1 id="titre-file" className="text-[22px] font-bold">
          À encaisser <span className="font-medium text-texte-doux">{texteFile(visibles.length)}</span>
        </h1>
        <Actualisation luA={luA} />
      </div>
      {visibles.length === 0 ? (
        <p className="border-t border-[#edf0f5] px-5 py-4 text-texte-doux">
          Aucun acte en attente. Les actes transmis par l&apos;Officier apparaîtront ici.
        </p>
      ) : (
        <Lignes lignes={visibles} surRenvoi={(id) => setRenvoyes((s) => new Set(s).add(id))} />
      )}
    </section>
  );
}

function Lignes({ lignes, surRenvoi }: { lignes: LigneFile[]; surRenvoi: (id: string) => void }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`hidden border-b border-bordure px-5 py-2.5 text-[13px] font-bold tracking-[0.05em] text-texte-doux uppercase lg:grid lg:gap-4 ${COLONNES_FILE}`}
      >
        <span>Transmis à</span>
        <span>ID de l&apos;acte</span>
        <span>Type</span>
        <span>Titulaire</span>
        <span>Montant dû</span>
        <span />
      </div>
      <ul>
        {lignes.map(({ acte: a, transmis, montant, obstacle }) => (
          <li
            key={a.id}
            data-a-encaisser={a.identifiant}
            className={`grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-[#edf0f5] px-5 py-3.5 first:border-t-0 lg:items-center ${COLONNES_FILE}`}
          >
            <span className="text-texte-doux lg:text-encre">
              <span className="lg:hidden">Transmis à </span>
              {transmis}
            </span>
            <Link href={`/caissier/actes/${a.id}`} className="font-mono text-[15px] font-semibold break-all">
              {a.identifiant}
            </Link>
            <span>
              <TypeActe type={a.type} />
              {a.categorie === "etranger" && <span className="ml-2 text-sm font-semibold text-texte-doux">Étranger</span>}
            </span>
            <span className="min-w-0 break-words">{a.titulaire}</span>
            <span className="text-lg font-bold">{montant}</span>
            <span className="flex flex-wrap items-center gap-2 lg:justify-end">
              <BoutonRenvoyer
                acte={{
                  id: a.id,
                  identifiant: a.identifiant,
                  titulaire: a.titulaire,
                }}
                surRenvoi={() => surRenvoi(a.id)}
              />
              <Link
                href={`/caissier/encaisser/${a.id}`}
                aria-label={`Encaisser ${a.identifiant}`}
                className="inline-flex h-11 items-center rounded-lg bg-bleu-etat px-[18px] font-bold text-white no-underline hover:bg-bleu-etat-fonce hover:text-white"
              >
                Encaisser
              </Link>
            </span>
            {obstacle && (
              <span className="text-[15px] font-semibold text-erreur-texte lg:col-span-6 lg:text-right" data-obstacle>
                {obstacle}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
