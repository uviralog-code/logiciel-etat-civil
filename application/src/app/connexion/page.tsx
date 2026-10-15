import type { Metadata } from "next";
import { LisereDrapeau } from "@/components/lisere-drapeau";
import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion" };

/**
 * Écran de connexion (fichier 16), d'après la maquette validée « Connexion ».
 * La page elle-même est fixe (préparée à l'avance, s'affiche instantanément) ;
 * seul le formulaire est interactif.
 */
export default function PageConnexion() {
  return (
    <div className="flex min-h-screen flex-col bg-fond">
      <LisereDrapeau />
      <div className="flex flex-1 flex-wrap">
        <section className="flex flex-[1_1_420px] flex-col lg:basis-[480px] xl:basis-[600px] 2xl:basis-[680px] justify-between gap-12 bg-bleu-etat px-8 py-12 text-white sm:px-[72px] sm:py-16">
          <div className="flex flex-col gap-1.5 text-[15px] uppercase tracking-[0.04em] text-[#d6e2f7]">
            <span>République Démocratique du Congo</span>
            <span>Province du Sud-Kivu · Ville d&apos;Uvira</span>
          </div>
          <div className="flex max-w-[520px] flex-col gap-5">
            <h1 className="font-serif text-4xl leading-[1.1] font-bold sm:text-5xl">
              Registre numérique de l&apos;état civil
            </h1>
            <p className="text-xl leading-normal text-[#d6e2f7]">
              Communes de Mulongwe, Kavimvira et Kalundu · Chefferie des Bavira
            </p>
          </div>
          <p className="text-sm text-[#b9cbeb]">Accès réservé aux agents habilités. Toute connexion est enregistrée.</p>
        </section>

        <main className="flex flex-[999_1_520px] items-center justify-center px-4 py-12 sm:px-6">
          <FormulaireConnexion />
        </main>
      </div>
    </div>
  );
}
