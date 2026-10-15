/**
 * DONNÉES DE DÉMONSTRATION — pour présenter le logiciel (assemblée plénière)
 *
 * Crée, dans une base NEUVE (aucun acte enregistré) :
 *   - un Officier et un Caissier pour chacune des 4 entités (mot de passe commun
 *     choisi à l'installation, à changer ou supprimer après la démonstration) ;
 *   - deux semaines d'activité fictive mais réaliste : actes enregistrés,
 *     encaissés en $ ou en FC, quelques exonérations, scans (PDF générés),
 *     actes délivrés, clôtures de caisse (dont un écart expliqué), une
 *     journée d'hier non clôturée à Kalundu ;
 *   - pour aujourd'hui : quelques actes en attente dans la file du Caissier.
 *
 * Tout passe par les vraies règles du logiciel (fonctions de la base, règles
 * d'accès) ; seules les dates sont ensuite reculées, jour par jour.
 *
 * Variables : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *             SUPABASE_DB_URL, MOT_DE_PASSE_DEMO, DOMAINE_COMPTES (facultatif).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const env = (cle, defaut) => {
  const v = (process.env[cle] ?? defaut ?? "").trim();
  if (!v) throw new Error(`Variable manquante : ${cle}`);
  return v;
};
const URL_SUPABASE = env("SUPABASE_URL");
const CLE_PUBLIQUE = env("SUPABASE_ANON_KEY");
const MOT_DE_PASSE = env("MOT_DE_PASSE_DEMO");
const DOMAINE = env("DOMAINE_COMPTES", "agents.etatcivil-uvira.local");
const JOURS = Number(process.env.JOURS_DEMO ?? 12);
if (MOT_DE_PASSE.length < 10) throw new Error("MOT_DE_PASSE_DEMO : 10 caractères au moins.");

const sql = (requete) =>
  execFileSync("psql", [env("SUPABASE_DB_URL"), "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", requete], { encoding: "utf8" }).trim();
const lit = (t) => `'${String(t).replace(/'/g, "''")}'`;
const verifier = (r, quoi) => {
  if (r.error) throw new Error(`${quoi} : ${r.error.message}`);
  return r.data;
};

// Hasard reproductible : la même démonstration à chaque installation
let graine = 20261015;
const hasard = () => {
  graine = (graine + 0x6d2b79f5) | 0;
  let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const choisir = (liste) => liste[Math.floor(hasard() * liste.length)];
const entre = (min, max) => min + Math.floor(hasard() * (max - min + 1));

// ---------------------------------------------------------------------
// 0. Base neuve seulement
// ---------------------------------------------------------------------
if (sql("select count(*) from public.actes") !== "0") {
  console.log("Des actes existent déjà dans cette base : la démonstration n'est chargée que dans une base neuve. Rien n'est fait.");
  process.exit(0);
}

// ---------------------------------------------------------------------
// 1. Comptes de démonstration
// ---------------------------------------------------------------------
const ENTITES = {
  MUL: { slug: "mulongwe", officier: "Bahati Mugisho", caissier: "Neema Furaha", actes: [6, 10] },
  KAV: { slug: "kavimvira", officier: "Amani Byamungu", caissier: "Zawadi Mwamini", actes: [5, 8] },
  KAL: { slug: "kalundu", officier: "Riziki Bisimwa", caissier: "Furaha Kahindo", actes: [3, 6] },
  BAV: { slug: "bavira", officier: "Mapendo Shukuru", caissier: "Imani Lwaboshi", actes: [2, 4] },
};
const service = createClient(URL_SUPABASE, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

async function compte(nom, nomComplet, role, code) {
  const email = `${nom}@${DOMAINE}`;
  if (sql(`select count(*) from public.utilisateurs where nom_utilisateur = ${lit(nom)}`) === "0") {
    const { data, error } = await service.auth.admin.createUser({ email, password: MOT_DE_PASSE, email_confirm: true });
    if (error) throw new Error(`Compte ${nom} : ${error.message}`);
    sql(`insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id, actif, doit_changer_mot_de_passe, double_verification)
         values (${lit(data.user.id)}, ${lit(nom)}, ${lit(nomComplet)}, ${lit(role)}, (select id from public.entites where code = ${lit(code)}), true, false, false)`);
  }
  const client = createClient(URL_SUPABASE, CLE_PUBLIQUE, { auth: { persistSession: false, autoRefreshToken: true } });
  const { error } = await client.auth.signInWithPassword({ email, password: MOT_DE_PASSE });
  if (error) throw new Error(`Connexion ${nom} impossible (mot de passe différent ?) : ${error.message}`);
  return client;
}

const agents = {};
for (const [code, e] of Object.entries(ENTITES)) {
  agents[code] = {
    id: sql(`select id from public.entites where code = ${lit(code)}`),
    officier: await compte(`${e.slug}.officier`, e.officier, "officier", code),
    caissier: await compte(`${e.slug}.caissier`, e.caissier, "caissier", code),
  };
  // Taux du jour (le reçu garde le taux appliqué)
  verifier(await agents[code].caissier.from("taux_change").insert({ entite_id: agents[code].id, taux: code === "BAV" ? 2840 : 2850 }), "Taux");
  console.log(`Comptes ${e.slug}.officier et ${e.slug}.caissier prêts.`);
}

// ---------------------------------------------------------------------
// 2. Catalogue utilisé (les actes les plus courants)
// ---------------------------------------------------------------------
const POIDS = { ATRES: 9, EXNAIS: 7, ATCEL: 4, ATIDC: 4, CBCVM: 3, PINHUM: 3, EXDEC: 2, ATVEUV: 2, ATLOG: 2, ATPEC: 1 };
const types = new Map(
  sql(`select code || '|' || id || '|' || modele_fiche from public.types_actes where code in (${Object.keys(POIDS).map(lit).join(",")}) and actif`)
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|"))
    .map(([code, id, modele]) => [code, { id, modele }]),
);
const sac = Object.entries(POIDS).flatMap(([code, n]) => (types.has(code) ? Array(n).fill(code) : []));

const PRENOMS = ["Grace", "Joseph", "Amani", "Neema", "Espoir", "Furaha", "Jean", "Esther", "Paul", "Aline", "Marie", "Patient", "Bienvenu", "Riziki", "Josué", "Clarisse", "Daniel", "Ruth", "Moïse", "Sifa"];
const NOMS = ["Mapendo", "Byamungu", "Kabila", "Bisimwa", "Kahindo", "Shukuru", "Mwamini", "Lwaboshi", "Mugisho", "Bahati", "Ndoole", "Zawadi", "Cirhuza", "Mukanirwa", "Ombeni", "Safari", "Bulambo", "Kasongo"];
const personne = () => `${choisir(NOMS)} ${choisir(PRENOMS)}`;
const isoJour = (decalage) => {
  const d = new Date(Date.now() + 2 * 3600e3); // heure d'Uvira
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
};
const details = (modele, jour) => {
  const deux = (n) => String(n).padStart(2, "0");
  if (modele === "naissance") return { sexe: choisir(["M", "F"]), date_naissance: `${entre(2008, 2025)}-${deux(entre(1, 12))}-${deux(entre(1, 28))}`, lieu_naissance: "Uvira" };
  if (modele === "deces") return { sexe: choisir(["M", "F"]), date_deces: jour, lieu_deces: "Uvira", age_au_deces: String(entre(40, 90)) };
  return {};
};

async function scanner(officier, acte, titulaire) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const police = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("RÉPUBLIQUE DÉMOCRATIQUE DU CONGO — ÉTAT CIVIL D'UVIRA", { x: 60, y: 780, size: 12, font: gras });
  page.drawText("Document de démonstration (scan fictif)", { x: 60, y: 760, size: 10, font: police, color: rgb(0.6, 0.1, 0.1) });
  page.drawText(`Acte ${acte.identifiant}`, { x: 60, y: 700, size: 16, font: gras });
  page.drawText(`Titulaire : ${titulaire}`, { x: 60, y: 670, size: 13, font: police });
  for (let i = 0; i < 14; i++) page.drawLine({ start: { x: 60, y: 620 - i * 30 }, end: { x: 535, y: 620 - i * 30 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const octets = await pdf.save();
  const chemin = verifier(await officier.rpc("chemin_archive", { p_acte: acte.id, p_type_mime: "application/pdf" }), "Emplacement du scan");
  verifier(await officier.storage.from("archives").upload(chemin, octets, { contentType: "application/pdf" }), "Envoi du scan");
  verifier(
    await officier.from("documents_scannes").insert({
      acte_id: acte.id, type_mime: "application/pdf", taille_octets: octets.length, nb_pages: 1,
      empreinte_sha256: createHash("sha256").update(octets).digest("hex"), mode_import: "fichier",
    }),
    "Enregistrement du scan",
  );
}

// ---------------------------------------------------------------------
// 3. Les journées, de la plus ancienne à aujourd'hui
// ---------------------------------------------------------------------
const MOTIFS_EXO = [
  "Indigent (attestation d'indigence) — attestation n° 0{n}/2026 du chef de quartier",
  "Décision de l'autorité locale — lettre n° {n}/2026",
];
let totalActes = 0;
let joursCrees = 0;
for (let k = JOURS - 1; k >= 0; k--) {
  const jour = isoJour(k);
  if (new Date(`${jour}T12:00:00Z`).getUTCDay() === 0 && k > 0) continue; // pas de bureau le dimanche
  const crees = { actes: [], recus: [], exonerations: [], scans: [] };
  joursCrees++;
  for (const [code, e] of Object.entries(ENTITES)) {
    const { officier, caissier } = agents[code];
    const n = entre(e.actes[0], e.actes[1]);
    for (let i = 0; i < n; i++) {
      const typeCode = choisir(sac);
      const t = types.get(typeCode);
      const titulaire = personne();
      const acte = verifier(
        await officier.rpc("enregistrer_acte", {
          p_type_acte: t.id, p_categorie: hasard() < 0.06 ? "etranger" : "national", p_titulaire_nom: titulaire, p_titulaire_2_nom: null,
          p_demandeur_nom: hasard() < 0.5 ? personne() : null, p_demandeur_telephone: null, p_observations: null,
          p_details: details(t.modele, jour), p_transmettre: true,
        }).single(),
        "Enregistrement d'un acte",
      );
      crees.actes.push(acte.id);
      totalActes++;
      const r = hasard();
      // Aujourd'hui : quelques actes restent dans la file du Caissier
      if (k === 0 && r < 0.3) continue;
      if (r < 0.06) {
        verifier(await caissier.rpc("exonerer", { p_acte: acte.id, p_motif: choisir(MOTIFS_EXO).replace("{n}", String(entre(10, 99))) }), "Exonération");
        crees.exonerations.push(acte.id);
      } else {
        const devise = acte.devise_du === "USD" && hasard() < 0.55 ? "USD" : "CDF";
        const recu = verifier(await caissier.rpc("encaisser", { p_acte: acte.id, p_devise_recue: devise }).single(), "Encaissement");
        crees.recus.push(recu.id);
      }
      // Scan : presque toujours les jours passés, plus rarement aujourd'hui
      if (hasard() < (k === 0 ? 0.5 : code === "BAV" ? 0.8 : 0.95)) {
        await scanner(officier, acte, titulaire);
        crees.scans.push(acte.id);
      }
      if (k > 0 && hasard() < 0.75) verifier(await officier.from("actes").update({ statut: "delivre" }).eq("id", acte.id), "Délivrance");
    }
  }

  // Les dates reculent jusqu'au jour voulu (triggers suspendus le temps de la correction)
  if (k > 0 && crees.actes.length) {
    const ids = (l) => (l.length ? l.map(lit).join(",") : "null");
    const decalage = `interval '${k} days'`;
    sql(`begin;
      alter table public.actes disable trigger user;
      alter table public.recus disable trigger user;
      alter table public.exonerations disable trigger user;
      alter table public.documents_scannes disable trigger user;
      update public.actes set date_acte = ${lit(jour)}, cree_le = cree_le - ${decalage}, modifie_le = modifie_le - ${decalage},
        transmis_le = transmis_le - ${decalage}, delivre_le = delivre_le - ${decalage} where id in (${ids(crees.actes)});
      update public.recus set journee = ${lit(jour)}, encaisse_le = encaisse_le - ${decalage} where id in (${ids(crees.recus)});
      update public.exonerations set journee = ${lit(jour)}, accorde_le = accorde_le - ${decalage} where acte_id in (${ids(crees.exonerations)});
      update public.documents_scannes set importe_le = importe_le - ${decalage} where acte_id in (${ids(crees.scans)});
      alter table public.actes enable trigger user;
      alter table public.recus enable trigger user;
      alter table public.exonerations enable trigger user;
      alter table public.documents_scannes enable trigger user;
      commit;`);

    // Clôtures : toutes, sauf Kalundu hier ; un manque expliqué à Mulongwe il y a 3 jours, un excédent à Bavira il y a 5 jours
    for (const code of Object.keys(ENTITES)) {
      if (k === 1 && code === "KAL") continue;
      const { caissier, id } = agents[code];
      const [usd, cdf] = sql(`select coalesce(sum(montant_recu) filter (where devise_recue = 'USD'), 0) || '|' || coalesce(sum(montant_recu) filter (where devise_recue = 'CDF'), 0)
                              from public.recus where entite_id = ${lit(id)} and journee = ${lit(jour)} and statut = 'valide'`).split("|").map(Number);
      let ecartCdf = 0;
      let explication = null;
      if (k === 3 && code === "MUL" && cdf >= 5000) [ecartCdf, explication] = [-5000, "Billet de 5 000 FC rendu par erreur à un usager vers 11 h"];
      if (k === 5 && code === "BAV") [ecartCdf, explication] = [1000, "Monnaie non rendue : l'usager est parti avant (à lui rendre à son retour)"];
      verifier(
        await caissier.rpc("cloturer_journee", { p_entite: id, p_compte_usd: usd, p_compte_cdf: cdf + ecartCdf, p_explication: explication, p_journee: jour }),
        `Clôture ${code} du ${jour}`,
      );
    }
  }
  console.log(`${jour} : ${crees.actes.length} actes, ${crees.recus.length} reçus, ${crees.exonerations.length} exonération(s), ${crees.scans.length} scans.`);
}

console.log(`\nDémonstration prête : ${totalActes} actes sur ${joursCrees} jours ouvrables, 8 comptes (mot de passe commun choisi à l'installation).`);
console.log("Comptes : mulongwe.officier, mulongwe.caissier, kavimvira.officier, kavimvira.caissier, kalundu.officier, kalundu.caissier, bavira.officier, bavira.caissier.");
