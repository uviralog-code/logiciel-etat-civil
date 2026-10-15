import Link from "next/link";
import type { ReactNode } from "react";
import { ROLES } from "@/lib/charte";
import { dateDuJour, MENUS, sousTitreEspace } from "@/lib/espaces";
import type { AgentConnecte } from "@/lib/session";
import { BoutonDeconnexion } from "./bouton-deconnexion";
import { Icone } from "./icone";
import { LisereDrapeau } from "./lisere-drapeau";
import { VoyantReseau } from "./voyant-reseau";

/**
 * Cadre commun des écrans de travail (maquettes « Accueil » de chaque rôle) :
 * menu à gauche, en-tête avec la date, l'état du réseau et l'agent connecté.
 * Il ne fait AUCUN contrôle d'accès : la page l'appelle après exigerEspace().
 */
export function CadreEspace({
  agent,
  actif,
  bandeau,
  enTete,
  children,
}: {
  agent: AgentConnecte;
  actif: string;
  /** Bande pleine largeur sous l'en-tête (ex. taux du jour sur l'accueil du caissier). */
  bandeau?: ReactNode;
  /** Remplace la date à gauche de l'en-tête (ex. étapes de la saisie d'un acte). */
  enTete?: ReactNode;
  children: ReactNode;
}) {
  const { profil } = agent;
  const menu = MENUS[profil.role];

  return (
    <div className="flex min-h-screen flex-col">
      <LisereDrapeau />
      <div className="flex flex-1 flex-wrap">
        <nav
          aria-label="Menu principal"
          className={`flex flex-[1_1_240px] flex-col gap-1.5 px-4 py-7 sm:max-w-[280px] ${
            profil.role === "admin" ? "bg-encre" : "bg-bleu-etat"
          }`}
        >
          <div className="flex flex-col gap-1 px-4 pb-6">
            <span className="font-serif text-xl font-bold text-white">État civil · Uvira</span>
            <span className="text-sm text-[#b9cbeb]">{sousTitreEspace(profil.role, profil.entite)}</span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {menu.map((entree) => (
              <li key={entree.chemin}>
                {entree.disponible ? (
                  <Link
                    href={entree.chemin}
                    aria-current={entree.chemin === actif ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 font-medium ${
                      entree.chemin === actif
                        ? "bg-white font-bold text-bleu-etat"
                        : "text-[#d6e2f7] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icone nom={entree.icone} />
                    {entree.libelle}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    title="Écran prévu à une prochaine étape"
                    className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 font-medium text-[#d6e2f7] opacity-50"
                  >
                    <Icone nom={entree.icone} />
                    {entree.libelle}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="flex-1" />
          <BoutonDeconnexion variante="menu" />
        </nav>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-bordure bg-surface px-6 py-[18px] sm:px-10">
            {enTete ?? <span className="text-texte-doux">{dateDuJour()}</span>}
            <div className="flex flex-wrap items-center gap-5">
              <VoyantReseau variante="pastille" />
              <span>
                <strong>{profil.nomComplet}</strong> · {ROLES[profil.role]}
              </span>
            </div>
          </header>
          {bandeau}
          <main className="flex w-full max-w-[1560px] flex-col gap-7 px-6 pt-8 pb-12 sm:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}

/** Ce qui s'affiche le temps de vérifier la session (fraction de seconde). */
export function ChargementEspace() {
  return (
    <div className="flex min-h-screen flex-col">
      <LisereDrapeau />
      <p className="m-auto text-texte-doux">Chargement…</p>
    </div>
  );
}
