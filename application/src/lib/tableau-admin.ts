/**
 * TABLEAU DE BORD DE L'ADMINISTRATEUR — maquette « Admin — Tableau de bord »
 *
 * Les 4 entités d'un coup d'œil : recettes du jour et du mois (calculées par
 * la base, comme les rapports), caisse de la veille clôturée ou non, écarts
 * de caisse du mois, actes payés sans scan, taux d'archivage, taux du dollar ;
 * puis les « points à vérifier » et les recettes du mois par entité.
 *
 * L'administrateur voit toutes les entités (règles d'accès du fichier 08).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { trierEntites } from "./grille-commune";
import { heureUvira } from "./taux";
import { aujourdhuiUvira, formaterDate, formaterMontant } from "./tarifs";

export type EtatCaisseHier = "cloturee" | "non_cloturee" | "sans_activite";

export interface LigneEntite {
  code: string;
  nom: string;
  /** « Mulongwe » (nom court, pour le graphique) */
  nomCourt: string;
  recettesJour: number;
  recettesMois: number;
  caisseHier: EtatCaisseHier;
  ecartMoisUsd: number;
  ecartMoisCdf: number;
  sansScan: number;
  archivagePct: number | null;
  taux: { valeur: number; duJour: boolean; quand: string } | null;
}

export interface PointAVerifier {
  sujet: "Caisse" | "Écart" | "Archivage" | "Tarif";
  grave: boolean;
  entite: string;
  texte: string;
}

export interface TableauAdmin {
  entites: LigneEntite[];
  total: { recettesJour: number; recettesMois: number; variationMoisPct: number | null; ecartMoisUsd: number; ecartMoisCdf: number; sansScan: number; archivagePct: number | null };
  libelleMois: string;
  points: PointAVerifier[];
}

/** « 2026-10-15 » → « 2026-10-14 » */
export function veille(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** « Commune de Mulongwe » → « Mulongwe », « Chefferie des Bavira » → « Bavira » */
export const nomCourt = (nom: string) => nom.replace(/^(Commune de |Chefferie des |Chefferie de )/i, "");

/** « de septembre », « d'octobre », « d'août » */
export const deMois = (mois: string) => (/^[aeiouyéèâ]/i.test(mois) ? `d'${mois}` : `de ${mois}`);

/** « 93,5 % » */
export const pourcentage = (p: number | null) => (p == null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(p)}\u00a0%`);

/** « − 5 000 FC », « + 2 000 FC », « 0 » ; dollars et francs ensemble si les deux bougent. */
export function texteEcart(usd: number, cdf: number): string {
  const un = (m: number, d: "USD" | "CDF") => `${m < 0 ? "−" : "+"} ${formaterMontant(Math.abs(m), d)}`;
  const parties = [usd ? un(usd, "USD") : null, cdf ? un(cdf, "CDF") : null].filter(Boolean);
  return parties.length ? parties.join(" ; ") : "0";
}

type Synthese = Record<string, string | number | null> & { entite_code: string };

function verifier<T>(r: { data: T | null; error: { message: string } | null }, quoi: string): T {
  if (r.error) throw new Error(`Lecture ${quoi} impossible : ${r.error.message}`);
  return r.data as T;
}

export async function lireTableauAdmin(supabase: SupabaseClient, aujourdhui = aujourdhuiUvira()): Promise<TableauAdmin> {
  const hier = veille(aujourdhui);
  const debutMois = `${aujourdhui.slice(0, 8)}01`;
  const [entites, jour, mois, synthHier, cloturesHier, ecarts, archivage, sansScan, taux, tarifs] = await Promise.all([
    supabase.from("entites").select("id, code, nom").eq("active", true),
    supabase.rpc("rapport_synthese", { p_periodicite: "jour", p_date: aujourdhui }),
    supabase.rpc("rapport_synthese", { p_periodicite: "mois", p_date: aujourdhui }),
    supabase.rpc("rapport_synthese", { p_periodicite: "jour", p_date: hier }),
    supabase.from("clotures_caisse").select("entite_id").eq("journee", hier),
    supabase
      .from("clotures_caisse")
      .select("entite_id, journee, ecart_usd, ecart_cdf, explication_ecart")
      .gte("journee", debutMois)
      .or("ecart_usd.neq.0,ecart_cdf.neq.0")
      .order("journee", { ascending: false })
      .limit(8),
    supabase.from("vue_taux_archivage").select("entite_code, actes_payes, actes_archives, taux_archivage_pct"),
    // Payés un jour précédent et toujours sans scan : l'oubli est réel
    supabase.from("vue_actes_non_archives").select("entite_id").gte("jours_ecoules", 1),
    supabase.from("taux_change").select("entite_id, taux, en_vigueur_depuis").lte("en_vigueur_depuis", new Date().toISOString()).order("en_vigueur_depuis", { ascending: false }).limit(200),
    supabase.from("vue_ecarts_tarifs").select("entite_code, acte, montant_commun, devise_commune, montant_entite, devise_entite"),
  ]);

  const listeEntites = trierEntites(verifier(entites, "des entités") ?? []) as { id: string; code: string; nom: string }[];
  const parCode = (r: { data: unknown; error: { message: string } | null }, quoi: string) =>
    new Map(((verifier(r, quoi) ?? []) as Synthese[]).map((l) => [l.entite_code, l]));
  const sJour = parCode(jour, "des recettes du jour");
  const sMois = parCode(mois, "des recettes du mois");
  const sHier = parCode(synthHier, "de la veille");
  const clotureesHier = new Set(((verifier(cloturesHier, "des clôtures") ?? []) as { entite_id: string }[]).map((c) => c.entite_id));
  const archiv = new Map(((verifier(archivage, "de l'archivage") ?? []) as { entite_code: string; actes_payes: number; actes_archives: number; taux_archivage_pct: number | string | null }[]).map((a) => [a.entite_code, a]));
  const retards = new Map<string, number>();
  for (const a of (verifier(sansScan, "des actes sans scan") ?? []) as { entite_id: string }[]) retards.set(a.entite_id, (retards.get(a.entite_id) ?? 0) + 1);
  const derniersTaux = new Map<string, { taux: number; en_vigueur_depuis: string }>();
  for (const t of (verifier(taux, "des taux") ?? []) as { entite_id: string; taux: number | string; en_vigueur_depuis: string }[]) {
    if (!derniersTaux.has(t.entite_id)) derniersTaux.set(t.entite_id, { taux: Number(t.taux), en_vigueur_depuis: t.en_vigueur_depuis });
  }
  const nb = (s: Synthese | undefined, cle: string) => Number(s?.[cle] ?? 0);

  const lignes: LigneEntite[] = listeEntites.map((e) => {
    const a = archiv.get(e.code);
    const t = derniersTaux.get(e.id);
    const activiteHier = nb(sHier.get(e.code), "recus_valides") + nb(sHier.get(e.code), "recus_annules") + nb(sHier.get(e.code), "exonerations") > 0;
    const jourTaux = t ? aujourdhuiUvira(new Date(t.en_vigueur_depuis)) : null;
    return {
      code: e.code,
      nom: e.nom,
      nomCourt: nomCourt(e.nom),
      recettesJour: nb(sJour.get(e.code), "recettes_equivalent_cdf"),
      recettesMois: nb(sMois.get(e.code), "recettes_equivalent_cdf"),
      caisseHier: clotureesHier.has(e.id) ? "cloturee" : activiteHier ? "non_cloturee" : "sans_activite",
      ecartMoisUsd: nb(sMois.get(e.code), "ecart_caisse_usd"),
      ecartMoisCdf: nb(sMois.get(e.code), "ecart_caisse_cdf"),
      sansScan: retards.get(e.id) ?? 0,
      archivagePct: a?.taux_archivage_pct == null ? null : Number(a.taux_archivage_pct),
      taux: t
        ? { valeur: t.taux, duJour: jourTaux === aujourdhui, quand: jourTaux === aujourdhui ? heureUvira(t.en_vigueur_depuis) : formaterDate(jourTaux!) }
        : null,
    };
  });

  const payes = [...archiv.values()].reduce((s, a) => s + Number(a.actes_payes ?? 0), 0);
  const archives = [...archiv.values()].reduce((s, a) => s + Number(a.actes_archives ?? 0), 0);
  const totalMois = lignes.reduce((s, l) => s + l.recettesMois, 0);
  const totalPrecedent = [...sMois.values()].filter((l) => l.entite_code !== "TOTAL").reduce((s, l) => s + Number(l.precedent_equivalent_cdf ?? 0), 0);

  // Points à vérifier : les plus graves d'abord
  const nomDe = new Map(listeEntites.map((e) => [e.id, nomCourt(e.nom)]));
  const nomCode = new Map(listeEntites.map((e) => [e.code, nomCourt(e.nom)]));
  const points: PointAVerifier[] = [];
  for (const l of lignes) {
    if (l.caisseHier === "non_cloturee") {
      points.push({ sujet: "Caisse", grave: true, entite: l.nomCourt, texte: `n'a pas clôturé la journée d'hier (${formaterDate(hier).slice(0, 5)}).` });
    }
  }
  for (const c of (verifier(ecarts, "des écarts") ?? []) as { entite_id: string; journee: string; ecart_usd: number | string; ecart_cdf: number | string; explication_ecart: string | null }[]) {
    const usd = Number(c.ecart_usd);
    const cdf = Number(c.ecart_cdf);
    const sens = usd + cdf < 0 ? "manque" : "excédent";
    points.push({
      sujet: "Écart", grave: usd < 0 || cdf < 0, entite: nomDe.get(c.entite_id) ?? "",
      texte: `${sens} de ${texteEcart(usd, cdf).replace(/[−+] /g, "")} le ${formaterDate(c.journee).slice(0, 5)}.${c.explication_ecart ? ` Explication : « ${c.explication_ecart} ».` : ""}`,
    });
  }
  for (const l of lignes) {
    if (l.sansScan > 0) {
      points.push({
        sujet: "Archivage", grave: false, entite: l.nomCourt,
        texte: `${l.sansScan} acte${l.sansScan > 1 ? "s" : ""} payé${l.sansScan > 1 ? "s" : ""} les jours précédents toujours sans scan${l.archivagePct != null ? ` ; taux d'archivage de ${pourcentage(l.archivagePct)}` : ""}.`,
      });
    }
  }
  const tarifsParEntite = new Map<string, { acte: string; montant_entite: number | string; devise_entite: "USD" | "CDF"; montant_commun: number | string | null; devise_commune: "USD" | "CDF" | null }[]>();
  for (const t of (verifier(tarifs, "des tarifs") ?? []) as { entite_code: string; acte: string; montant_entite: number | string; devise_entite: "USD" | "CDF"; montant_commun: number | string | null; devise_commune: "USD" | "CDF" | null }[]) {
    tarifsParEntite.set(t.entite_code, [...(tarifsParEntite.get(t.entite_code) ?? []), t]);
  }
  for (const [code, liste] of tarifsParEntite) {
    const premier = liste[0];
    const grille = premier.montant_commun != null && premier.devise_commune ? ` (grille : ${formaterMontant(Number(premier.montant_commun), premier.devise_commune)})` : "";
    points.push({
      sujet: "Tarif", grave: false, entite: nomCode.get(code) ?? code,
      texte:
        liste.length === 1
          ? `applique « ${premier.acte} » à ${formaterMontant(Number(premier.montant_entite), premier.devise_entite)}${grille}.`
          : `applique ${liste.length} tarifs différents de la grille commune (dont « ${premier.acte} » à ${formaterMontant(Number(premier.montant_entite), premier.devise_entite)}${grille}).`,
    });
  }
  points.sort((a, b) => Number(b.grave) - Number(a.grave));

  const moisLibelle = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(new Date(`${aujourdhui}T12:00:00Z`));
  return {
    entites: lignes,
    total: {
      recettesJour: lignes.reduce((s, l) => s + l.recettesJour, 0),
      recettesMois: totalMois,
      variationMoisPct: totalPrecedent ? Math.round((1000 * (totalMois - totalPrecedent)) / totalPrecedent) / 10 : null,
      ecartMoisUsd: lignes.reduce((s, l) => s + l.ecartMoisUsd, 0),
      ecartMoisCdf: lignes.reduce((s, l) => s + l.ecartMoisCdf, 0),
      sansScan: lignes.reduce((s, l) => s + l.sansScan, 0),
      archivagePct: payes ? Math.round((1000 * archives) / payes) / 10 : null,
    },
    libelleMois: moisLibelle,
    points,
  };
}
