import type { Metadata } from "next";
import { Suspense } from "react";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { exigerEspace } from "@/lib/acces";
import { cartesParFamille } from "@/lib/nouvel-acte";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lignesTarifsEntite, lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, lireDonneesTarifaires } from "@/lib/tarifs";
import { ChoixType } from "./choix-type";

export const metadata: Metadata = { title: "Nouvel acte" };

/** Étape 1 de la saisie (fichier 29) : choisir le type d'acte (maquette « Nouvel acte — Type »). */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Choix />
    </Suspense>
  );
}

async function Choix() {
  const agent = await exigerEspace("officier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité de l'officier introuvable.");
  const donnees = await lireDonneesTarifaires(supabase, { entiteId: entite.id });
  const groupes = cartesParFamille(lignesTarifsEntite(donnees, entite.id, aujourdhuiUvira()));

  return (
    <CadreEspace agent={agent} actif="/officier/actes/nouveau" enTete={<EtapesSaisie courante={1} />}>
      {/* Nouvelle clé à chaque visite : l'écran repart toujours vide (Next garde en mémoire les écrans déjà vus) */}
      <ChoixType key={crypto.randomUUID()} groupes={groupes} />
    </CadreEspace>
  );
}
