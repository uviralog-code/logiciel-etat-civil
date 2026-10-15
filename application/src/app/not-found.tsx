import Link from "next/link";
import { LisereDrapeau } from "@/components/lisere-drapeau";

/** Page « introuvable », en français. */
export default function PageIntrouvable() {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <main className="m-auto flex max-w-lg flex-col items-start gap-4 px-6 py-12">
        <p className="text-sm font-bold tracking-[0.04em] text-texte-doux uppercase">Erreur 404</p>
        <h1 className="font-serif text-3xl font-bold">Page introuvable</h1>
        <p className="leading-normal text-texte-doux">
          Cette adresse ne correspond à aucun écran du logiciel. Elle a peut-être été mal recopiée, ou l&apos;écran
          n&apos;existe pas encore.
        </p>
        <Link
          href="/"
          className="flex h-12 items-center rounded-lg bg-bleu-etat px-5 font-bold text-white hover:bg-bleu-etat-fonce"
        >
          Retour à mon espace
        </Link>
      </main>
    </div>
  );
}
