"use client";

import Link from "next/link";
import { LisereDrapeau } from "@/components/lisere-drapeau";

/**
 * Écran affiché si une page rencontre une erreur imprévue (base injoignable…),
 * à la place de la page d'erreur anglaise de Next.js.
 */
export default function Erreur({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <main className="m-auto flex max-w-lg flex-col items-start gap-4 px-6 py-12">
        <p className="text-sm font-bold tracking-[0.04em] text-texte-doux uppercase">Erreur</p>
        <h1 className="font-serif text-3xl font-bold">La page n&apos;a pas pu s&apos;afficher</h1>
        <p className="leading-normal text-texte-doux">
          Le serveur est peut-être injoignable. Vérifiez la connexion à internet, puis réessayez. Si cela continue,
          prévenez le service technique de la CDJP{error.digest ? " en lui donnant ce code :" : "."}
        </p>
        {error.digest && <p className="font-mono font-semibold">{error.digest}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="flex h-12 items-center rounded-lg bg-bleu-etat px-5 font-bold text-white hover:bg-bleu-etat-fonce"
          >
            Réessayer
          </button>
          <Link href="/" className="flex h-12 items-center rounded-lg border border-bordure-champ px-5 font-semibold">
            Retour à mon espace
          </Link>
        </div>
      </main>
    </div>
  );
}
