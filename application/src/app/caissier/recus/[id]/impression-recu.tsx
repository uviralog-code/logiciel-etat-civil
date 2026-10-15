"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { RecuA5 } from "@/components/recu-a5";
import { etatImpressions, mentionImpression, type RecuDetaille } from "@/lib/recus";
import { imprimerRecu } from "../../actions";

const abonnementVide = () => () => {};
const bouton = "inline-flex h-12 items-center rounded-lg px-5 font-bold no-underline";

/**
 * Reçu A5 à l'écran, et ses gestes (fichier 39) : imprimer (A5), télécharger le
 * PDF. Chaque impression est comptée par la base : la 1re est l'original, les
 * suivantes portent « DUPLICATA n° N ». Après un encaissement (?imprimer=1),
 * l'impression se lance toute seule.
 */
export function ImpressionRecu({ recu, qrSvg, imprimerTout }: { recu: RecuDetaille; qrSvg: string; imprimerTout: boolean }) {
  const router = useRouter();
  const [impressions, setImpressions] = useState(recu.impressions);
  // Numéro de l'impression en cours : la mention du reçu imprimé en dépend
  const [enImpression, setEnImpression] = useState<{ numero: number; fois: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);
  const [enCours, demarrer] = useTransition();
  // Vrai seulement dans le navigateur (le portail vise document.body)
  const monte = useSyncExternalStore(abonnementVide, () => true, () => false);
  const lance = useRef(false);

  const imprimer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await imprimerRecu(recu.id);
      if (!r.ok) {
        setErreur(r.message);
        return;
      }
      setImpressions(r.numero);
      setEnImpression((p) => ({ numero: r.numero, fois: (p?.fois ?? 0) + 1 }));
    });

  // L'impression part une fois le reçu (avec sa mention) affiché
  useEffect(() => {
    if (enImpression) window.print();
  }, [enImpression]);

  // Juste après l'encaissement : impression automatique, une seule fois
  useEffect(() => {
    if (!imprimerTout || lance.current) return;
    lance.current = true;
    router.replace(`/caissier/recus/${recu.id}`, { scroll: false });
    imprimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'ouverture
  }, []);

  const telecharger = async () => {
    setErreur(null);
    setTelechargement(true);
    try {
      const reponse = await fetch(`/caissier/recus/${recu.id}/pdf`, { method: "POST" });
      if (!reponse.ok) {
        setErreur(await reponse.text());
        return;
      }
      setImpressions(Number(reponse.headers.get("x-numero-impression") ?? impressions + 1));
      const nom = /filename="([^"]+)"/.exec(reponse.headers.get("content-disposition") ?? "")?.[1] ?? `${recu.numero}.pdf`;
      const lien = document.createElement("a");
      lien.href = URL.createObjectURL(await reponse.blob());
      lien.download = nom;
      document.body.append(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(lien.href), 10_000);
    } catch {
      setErreur("La connexion a été coupée : le PDF n'a pas pu être téléchargé. Réessayez.");
    } finally {
      setTelechargement(false);
    }
  };

  const annule = recu.statut === "annule";
  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        {annule ? (
          <p role="alert" className="rounded-lg bg-erreur-fond px-4 py-3 font-bold text-erreur-texte">
            Reçu ANNULÉ{recu.motifAnnulation ? ` · ${recu.motifAnnulation}` : ""} : il n&apos;a aucune valeur.
          </p>
        ) : (
          <p role="status" className="rounded-lg bg-succes-fond px-4 py-3 font-bold text-succes-texte">
            Paiement enregistré : l&apos;acte est payé.
          </p>
        )}
        <div className="flex flex-col gap-3 rounded-[10px] border border-bordure bg-surface p-5">
          <h1 className="text-xl font-bold">Reçu {recu.numero}</h1>
          <p className="text-texte-doux" data-testid="etat-impressions">
            {etatImpressions(impressions)}
          </p>
          {erreur && (
            <p role="alert" className="rounded-lg bg-erreur-fond px-3.5 py-2.5 font-semibold text-erreur-texte">
              {erreur}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={imprimer} disabled={enCours} className={`${bouton} bg-bleu-etat text-white hover:bg-bleu-etat-fonce disabled:cursor-wait disabled:opacity-75`}>
              {enCours ? "Préparation…" : "Imprimer le reçu (A5)"}
            </button>
            <button
              type="button"
              onClick={telecharger}
              disabled={telechargement}
              className={`${bouton} border border-bleu-etat bg-surface text-bleu-etat hover:bg-bleu-clair disabled:cursor-wait disabled:opacity-75`}
            >
              {telechargement ? "Préparation du PDF…" : "Télécharger le PDF"}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-[#edf0f5] pt-3">
            <Link href="/caissier" className={`${bouton} border border-bordure-champ text-encre hover:bg-bleu-clair`}>
              Acte suivant
            </Link>
            <Link href={`/caissier/actes/${recu.acte.id}`} className={`${bouton} border border-bordure-champ text-encre hover:bg-bleu-clair`}>
              Voir la fiche de l&apos;acte
            </Link>
          </div>
        </div>
      </div>

      {/* Aperçu à l'écran : la feuille A5 telle qu'elle sortira de l'imprimante */}
      <div className="max-w-full overflow-x-auto" data-testid="apercu-recu">
        <div className="w-fit shadow-[0_2px_12px_rgba(20,33,61,0.18)]">
          <RecuA5 recu={recu} qrSvg={qrSvg} mention={mentionImpression(impressions + 1)} />
        </div>
        <p className="mt-2 text-[15px] text-texte-doux">Aperçu de la prochaine impression.</p>
      </div>

      {monte &&
        createPortal(
          <div className="recu-impression hidden" aria-hidden="true">
            <RecuA5 recu={recu} qrSvg={qrSvg} mention={mentionImpression(enImpression?.numero ?? impressions + 1)} />
          </div>,
          document.body,
        )}
    </div>
  );
}
