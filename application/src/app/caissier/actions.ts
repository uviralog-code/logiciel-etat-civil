"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { MESSAGES_RENVOI, renvoyerActe, type ResultatRenvoi } from "@/lib/accueil-caissier";
import { regleAcces } from "@/lib/aiguillage";
import { cloturerJournee, MESSAGES_CLOTURE, type ResultatCloture, type SaisieCloture } from "@/lib/cloture";
import { encaisserActe, exonererActe, MESSAGES_ENCAISSEMENT, type ResultatEncaissement, type ResultatExoneration } from "@/lib/encaissement";
import { enregistrerImpression, type ResultatImpression } from "@/lib/recus";
import { annulerRecu, MESSAGES_ANNULATION, type ResultatAnnulation } from "@/lib/recus-du-jour";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { lireEntite } from "@/lib/tarifs-entite";
import { aujourdhuiUvira } from "@/lib/tarifs";

/*
 * Le droit d'agir est revérifié avant tout ; la base contrôle ensuite elle-même
 * que l'acte est de l'entité du caissier et toujours en attente de paiement.
 */
const texte = (v: unknown) => String(v ?? "");

/** « Renvoyer à l'Officier » (fichier 37) : motif courant + précision. */
export async function renvoyer(acteId: string, motif: string, precision: string): Promise<ResultatRenvoi> {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return { ok: false, message: MESSAGES_RENVOI.refus };
  const supabase = await creerClientServeur();
  const r = await renvoyerActe(supabase, texte(acteId), texte(motif), texte(precision));
  // Succès, ou acte déjà parti de la file : l'accueil est relu dans les deux cas
  if (r.ok || r.message === MESSAGES_RENVOI.plusEnAttente) refresh();
  return r;
}

/** « Valider l'encaissement » (fichier 38), après confirmation : le reçu porte exactement le montant annoncé. */
export async function encaisser(acteId: string, devise: string, montantAnnonce: number): Promise<ResultatEncaissement> {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return { ok: false, message: MESSAGES_ENCAISSEMENT.refus };
  const supabase = await creerClientServeur();
  const r = await encaisserActe(supabase, texte(acteId), texte(devise), Number(montantAnnonce));
  // Le reçu s'ouvre et l'impression se lance (fichier 39)
  if (r.ok) redirect(`/caissier/recus/${r.recu.id}?imprimer=1`);
  return r;
}

/** « Exonérer » (fichier 38) : motif courant + précision obligatoire ; retour à l'accueil avec l'annonce. */
export async function exonerer(acteId: string, identifiant: string, motif: string, precision: string): Promise<ResultatExoneration> {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return { ok: false, message: MESSAGES_ENCAISSEMENT.refus };
  const supabase = await creerClientServeur();
  const r = await exonererActe(supabase, texte(acteId), texte(motif), texte(precision));
  if (r.ok) redirect(`/caissier?exonere=${encodeURIComponent(texte(identifiant))}`);
  return r;
}

/** « Imprimer le reçu » (fichier 39) : compte l'impression ; 1 = original, ensuite duplicata. */
export async function imprimerRecu(recuId: string): Promise<ResultatImpression> {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return { ok: false, message: MESSAGES_ENCAISSEMENT.refus };
  return enregistrerImpression(await creerClientServeur(), texte(recuId), "impression");
}

/** « Annuler le reçu » (fichier 40) : motif libre ; l'acte est remis dans la file ou annulé. */
export async function annulerLeRecu(recuId: string, motif: string, suite: string): Promise<ResultatAnnulation> {
  if (!regleAcces(await lireAgentConnecte(), "caissier").autorise) return { ok: false, message: MESSAGES_ANNULATION.refus };
  const r = await annulerRecu(await creerClientServeur(), texte(recuId), texte(motif), texte(suite));
  if (r.ok) refresh();
  return r;
}

/** « Clôturer la journée » (fichier 41) : la journée du jour, pour l'entité du caissier connecté. */
export async function cloturer(s: SaisieCloture): Promise<ResultatCloture> {
  const agent = await lireAgentConnecte();
  if (!regleAcces(agent, "caissier").autorise || !agent) return { ok: false, message: MESSAGES_CLOTURE.refus };
  const supabase = await creerClientServeur();
  const entite = await lireEntite(supabase, agent.profil.entite?.code ?? "");
  if (!entite) return { ok: false, message: MESSAGES_CLOTURE.refus };
  const r = await cloturerJournee(supabase, entite.id, aujourdhuiUvira(), {
    compteUsd: texte(s?.compteUsd), compteCdf: texte(s?.compteCdf), explication: texte(s?.explication),
    attenduUsd: Number(s?.attenduUsd), attenduCdf: Number(s?.attenduCdf),
  });
  if (r.ok) redirect("/caissier/cloture?faite=1");
  if (r.message === MESSAGES_CLOTURE.attenduChange) refresh();
  return r;
}
