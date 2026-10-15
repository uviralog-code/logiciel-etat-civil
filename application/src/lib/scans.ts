/**
 * LES SCANS D'UN ACTE (fichier 33) : emplacement prévu, contrôle d'un
 * doublon avant l'envoi, enregistrement après l'envoi, versions, lien
 * de consultation.
 *
 * L'enregistrement se fait côté serveur : le serveur relit le fichier
 * RÉELLEMENT déposé, vérifie que c'est un PDF lisible, compte ses pages et
 * calcule lui-même son empreinte SHA-256. La base vérifie ensuite tout le
 * reste (acte établi, de l'entité, emplacement, doublon, motif, taille).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { empreinteSha256, lireMotifRemplacement, relirePdf } from "./archivage";

export type ModeImport = "fichier" | "photo" | "scanner" | "lot";

export interface VersionScan {
  id: string;
  version: number;
  chemin_stockage: string;
  importe_le: string;
  importe_par: string | null;
  nb_pages: number | null;
  taille_octets: number;
  motif_remplacement: string | null;
  mode_import: ModeImport | "lot";
}

/** Toutes les versions du scan d'un acte, la plus récente (celle qui fait foi) d'abord. */
export async function lireScans(supabase: SupabaseClient, acteId: string): Promise<VersionScan[]> {
  const { data, error } = await supabase
    .from("documents_scannes")
    .select("id, version, chemin_stockage, importe_le, importe_par, nb_pages, taille_octets, motif_remplacement, mode_import")
    .eq("acte_id", acteId)
    .order("version", { ascending: false })
    .returns<VersionScan[]>();
  if (error) throw new Error(`Lecture des scans impossible : ${error.message}`);
  return (data ?? []).map((v) => ({ ...v, taille_octets: Number(v.taille_octets) }));
}

/** Emplacement où déposer le prochain scan (calculé par la base). */
export async function cheminPrevu(supabase: SupabaseClient, acteId: string): Promise<string> {
  const { data, error } = await supabase.rpc("chemin_archive", { p_acte: acteId, p_type_mime: "application/pdf" });
  if (error) throw new Error(error.code === "P0001" ? error.message : `Emplacement du scan introuvable : ${error.message}`);
  return data as string;
}

/** Avant l'envoi : message si ce même fichier est déjà archivé, sinon null. */
export async function verifierEmpreinte(supabase: SupabaseClient, acteId: string, empreinte: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("verifier_empreinte_scan", { p_acte: acteId, p_empreinte: empreinte });
  if (error) throw new Error(error.code === "P0001" ? error.message : `Vérification impossible : ${error.message}`);
  return (data as string | null) ?? null;
}

export type ResultatScan = { ok: true; version: number; pages: number } | { ok: false; message: string; champ?: "motif" };

/**
 * Après l'envoi : relit le fichier déposé à l'emplacement prévu et
 * l'enregistre comme scan de l'acte. `motif` est obligatoire pour refaire
 * un scan (version 2 et suivantes).
 */
export async function enregistrerScan(
  supabase: SupabaseClient,
  /** `lotId` : ancien acte numérisé dans un lot (fichier 36), le mode est alors « lot ». */
  e: { acteId: string; motif: string | null; mode: ModeImport; lotId?: string },
): Promise<ResultatScan> {
  const versions = await lireScans(supabase, e.acteId);
  let motif: string | null = null;
  if (versions.length > 0) {
    const m = lireMotifRemplacement(e.motif ?? "");
    if (!m.ok) return { ok: false, message: m.message, champ: "motif" };
    motif = m.motif;
  }

  let chemin: string;
  try {
    chemin = await cheminPrevu(supabase, e.acteId);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }

  const telechargement = await supabase.storage.from("archives").download(chemin);
  if (telechargement.error || !telechargement.data) {
    return { ok: false, message: "Le fichier n'a pas été reçu en entier. Cliquez à nouveau sur « Valider l'archivage » pour reprendre l'envoi." };
  }
  const octets = new Uint8Array(await telechargement.data.arrayBuffer());
  const relu = await relirePdf(octets);
  if (!relu.ok) return relu;

  const { data, error } = await supabase
    .from("documents_scannes")
    .insert({
      acte_id: e.acteId,
      type_mime: "application/pdf",
      taille_octets: octets.length,
      nb_pages: relu.pages,
      empreinte_sha256: await empreinteSha256(octets),
      mode_import: e.lotId ? "lot" : e.mode,
      lot_id: e.lotId ?? null,
      motif_remplacement: motif,
    })
    .select("version")
    .single<{ version: number }>();
  if (error) {
    if (error.code === "P0001") return { ok: false, message: error.message };
    if (error.message.includes("documents_remplacement_motive")) {
      return { ok: false, message: "Indiquez pourquoi le scan est refait.", champ: "motif" };
    }
    if (error.code === "42501") return { ok: false, message: "Seul l'Officier de l'entité peut archiver le scan d'un acte." };
    throw new Error(`Enregistrement du scan impossible : ${error.message}`);
  }
  return { ok: true, version: data.version, pages: relu.pages };
}

/** Lien de consultation du PDF, valable 5 minutes (l'espace de stockage est privé). */
export async function lienConsultation(supabase: SupabaseClient, chemin: string, secondes = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from("archives").createSignedUrl(chemin, secondes);
  if (error || !data) return null;
  return data.signedUrl;
}
