"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  annulerActe,
  corrigerActe,
  corrigerNomActe,
  delivrerActe,
  enregistrerActe,
  MESSAGES_ACTE,
  transmettreActe,
  type ResultatActe,
  type SaisieActe,
  type SaisieNoms,
} from "@/lib/actes";
import { regleAcces } from "@/lib/aiguillage";
import { lireAgentConnecte } from "@/lib/session";
import { creerClientServeur } from "@/lib/supabase/serveur";
import { aujourdhuiUvira } from "@/lib/tarifs";

/*
 * Le droit d'agir est revérifié avant tout ; l'entité est celle de l'officier
 * connecté (la base la prend elle-même, fichier 28), jamais une valeur du navigateur.
 */
async function client() {
  return regleAcces(await lireAgentConnecte(), "officier").autorise ? creerClientServeur() : null;
}
const texte = (v: unknown) => String(v ?? "");

/** Saisie reçue du navigateur, réduite à des textes. */
function nettoyerSaisie(s: SaisieActe): SaisieActe {
  const details: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(s?.details ?? {})) if (/^[a-z_]{2,30}$/.test(cle)) details[cle] = texte(valeur);
  return {
    typeActeId: texte(s?.typeActeId), categorie: texte(s?.categorie), titulaire: texte(s?.titulaire), titulaire2: texte(s?.titulaire2),
    demandeur: texte(s?.demandeur), telephone: texte(s?.telephone), observations: texte(s?.observations), details,
  };
}

/** « Enregistrer et transmettre au Caissier » ou « Enregistrer sans transmettre ». */
export async function enregistrer(s: SaisieActe, transmettre: boolean): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await enregistrerActe(supabase, nettoyerSaisie(s), transmettre === true, aujourdhuiUvira());
  // Étape 3 : l'écran de confirmation, avec l'ID donné par la base
  if (r.ok) redirect(`/officier/actes/${r.acte.id}/enregistre`);
  return r;
}

/** « Corriger et transmettre au Caissier » ou « Corriger sans transmettre » (acte « enregistré »). */
export async function corriger(id: string, s: SaisieActe, transmettre: boolean): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await corrigerActe(supabase, texte(id), nettoyerSaisie(s), transmettre === true, aujourdhuiUvira());
  if (r.ok) redirect(`/officier/actes/${r.acte.id}/enregistre?corrige=1`);
  return r;
}

/** « Transmettre au Caissier » depuis l'écran de confirmation. */
export async function transmettre(id: string): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await transmettreActe(supabase, texte(id));
  if (r.ok) redirect(`/officier/actes/${r.acte.id}/enregistre`);
  return r;
}

// ---------------------------------------------------------------------
// Fiche d'un acte (fichier 31) : l'écran est remis à jour après chaque geste
// ---------------------------------------------------------------------

/** « Corriger l'orthographe d'un nom » (acte payé, exonéré ou délivré ; motif obligatoire). */
export async function corrigerNom(id: string, s: SaisieNoms, deuxEpoux: boolean): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await corrigerNomActe(
    supabase,
    texte(id),
    { titulaire: texte(s?.titulaire), titulaire2: texte(s?.titulaire2), demandeur: texte(s?.demandeur), motif: texte(s?.motif) },
    deuxEpoux === true,
  );
  if (r.ok) refresh();
  return r;
}

/** « Marquer comme délivré ». */
export async function delivrer(id: string): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await delivrerActe(supabase, texte(id));
  if (r.ok) refresh();
  return r;
}

/** « Annuler l'acte… » (pas encore payé ; motif obligatoire ; définitif). */
export async function annuler(id: string, motif: string): Promise<ResultatActe> {
  const supabase = await client();
  if (!supabase) return { ok: false, message: MESSAGES_ACTE.refus };
  const r = await annulerActe(supabase, texte(id), texte(motif));
  if (r.ok) refresh();
  return r;
}

