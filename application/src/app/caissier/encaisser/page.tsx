import type { Metadata } from "next";
import { Suspense } from "react";
import { BandeauTaux } from "@/components/bandeau-taux";
import { CadreEspace, ChargementEspace } from "@/components/cadre-espace";
import { lireAccueilCaissier, momentTransmission, obstacleEncaissement } from "@/lib/accueil-caissier";
import { exigerEspace } from "@/lib/acces";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { etatTauxDuJour, heureUvira, lireHistoriqueTaux } from "@/lib/taux";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira, formaterMontant } from "@/lib/tarifs";
import { Annonces } from "../actualisation";
import { FileAEncaisser } from "../file-a-encaisser";

export const metadata: Metadata = { title: "Encaisser" };

/** Menu « Encaisser » (fichier 38) : la file d'attente seule ; chaque acte ouvre l'écran d'encaissement. */
export default function Page() {
  return (
    <Suspense fallback={<ChargementEspace />}>
      <Encaisser />
    </Suspense>
  );
}

async function Encaisser() {
  const agent = await exigerEspace("caissier");
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) throw new Error("Entité du caissier introuvable.");
  const aujourdhui = aujourdhuiUvira();
  const [{ aEncaisser, clotureLe }, [dernierTaux]] = await Promise.all([
    lireAccueilCaissier(supabase, entite.id, aujourdhui),
    lireHistoriqueTaux(supabase, entite.id, 1),
  ]);
  const taux = etatTauxDuJour(dernierTaux ?? null);
  return (
    <CadreEspace agent={agent} actif="/caissier/encaisser" bandeau={<BandeauTaux etat={taux} />}>
      <Annonces />
      <FileAEncaisser
        luA={heureUvira(new Date())}
        lignes={aEncaisser.map((a) => ({
          acte: { id: a.id, identifiant: a.identifiant, type: a.type, titulaire: a.titulaire, categorie: a.categorie },
          transmis: momentTransmission(a.transmisLe, aujourdhui),
          montant: formaterMontant(a.montant, a.devise),
          obstacle: obstacleEncaissement(a, taux, clotureLe),
        }))}
      />
    </CadreEspace>
  );
}
