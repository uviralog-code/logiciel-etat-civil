// Fichier 31 — fiche d'un acte : parcours, informations, gestes permis
import { describe, expect, it } from "vitest";
import type { StatutActe } from "./charte";
import { actionsPossibles, cheminPrevu, informationsActe, parcoursActe, resumeVersion, statutAffiche, type FicheActe } from "./fiche-acte";

const n = (s: string) => s.replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-13";
// Horodatages en UTC : Uvira = UTC+2
const fiche = (o: Partial<FicheActe["acte"]> = {}, autres: Partial<Omit<FicheActe, "acte">> = {}): FicheActe => ({
  acte: {
    id: "a1", identifiant: "MUL-EXNAIS-2026-000123", entite_id: "mul", type_acte_id: "exnais", annee: 2026, numero_ordre: 123, origine: "nouveau",
    numero_registre: null, titulaire_nom: "MUGISHO Bahati Jean", titulaire_2_nom: null, demandeur_nom: "Mugisho Pierre", demandeur_telephone: "+243 99 000 0000",
    categorie: "national", montant_du: 30, devise_du: "USD", statut: "delivre", date_acte: "2026-10-13", delivre_le: "2026-10-13T08:02:00Z",
    annule_le: null, motif_annulation: null, motif_renvoi: null, renvoye_le: null, observations: null, cree_le: "2026-10-13T06:12:00Z", modifie_le: "2026-10-13T08:05:00Z",
    type: { code: "EXNAIS", libelle: "Extrait d'acte de naissance", famille: "extrait", couleur: "#2E7D32", modele_fiche: "naissance", tarif_distinct_etranger: false },
    entite: { code: "MUL", nom: "Commune de Mulongwe" },
    details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: "Uvira", nom_pere: "Mugisho Pierre", nom_mere: "Bahati Claire" },
    transmis_le: "2026-10-13T06:15:00Z", cree_par: "off", delivre_par: "off", renvoye_par: null, motif_correction: null, corrige_le: null, corrige_par: null,
    ...o,
  },
  recu: {
    id: "00000000-0000-0000-0000-0000000000c1", numero_recu: "MUL-REC-2026-000845", encaisse_le: "2026-10-13T06:29:00Z", encaisse_par: "cai", devise_recue: "CDF", montant_recu: 85500,
    taux_applique: 2850, montant_equivalent_cdf: 85500, statut: "valide",
  },
  exoneration: null,
  document: { chemin_stockage: "MUL/2026/MUL-EXNAIS-2026-000123.pdf", version: 1, importe_le: "2026-10-13T08:05:00Z", nb_pages: 1 },
  scans: [],
  noms: { off: "Bahati Mugisho", cai: "Neema Furaha" },
  ...autres,
});

describe("Parcours (comme la maquette)", () => {
  it("enregistré → transmis → payé → délivré → scanné, avec heures, noms et n° de reçu", () => {
    expect(parcoursActe(fiche(), AUJOURDHUI)).toEqual([
      { libelle: "Enregistré", details: ["13/10 · 08 h 12 · Bahati Mugisho"], etat: "fait" },
      { libelle: "Transmis au Caissier", details: ["08 h 15"], etat: "fait" },
      { libelle: "Payé", details: ["08 h 29 · Neema Furaha", "MUL-REC-2026-000845"], etat: "fait" },
      { libelle: "Délivré", details: ["10 h 02 · Bahati Mugisho"], etat: "fait" },
      { libelle: "Scanné", details: ["10 h 05 · version 1"], etat: "scanne" },
    ]);
  });

  it("acte juste enregistré : les étapes suivantes sont « à venir »", () => {
    const f = fiche({ statut: "enregistre", transmis_le: null, delivre_le: null }, { recu: null, document: null });
    expect(parcoursActe(f, AUJOURDHUI).map((e) => [e.libelle, e.etat])).toEqual([
      ["Enregistré", "fait"], ["Transmis au Caissier", "a-venir"], ["Payé", "a-venir"], ["Délivré", "a-venir"], ["Scanné", "a-venir"],
    ]);
  });

  it("exonéré, un autre jour ; annulé avec motif", () => {
    const f = fiche(
      { statut: "annule", annule_le: "2026-10-14T07:00:00Z", motif_annulation: "Reçu annulé : erreur", delivre_le: null },
      { recu: null, exoneration: { motif: "Indigent", accorde_le: "2026-10-12T09:00:00Z", accorde_par: "cai" }, document: null },
    );
    const p = parcoursActe(f, AUJOURDHUI);
    expect(p[2]).toEqual({ libelle: "Exonéré", details: ["12/10 · 11 h 00 · Neema Furaha", "Motif : Indigent"], etat: "fait" });
    expect(p.at(-1)).toEqual({ libelle: "Annulé", details: ["14/10 · 09 h 00", "Motif : Reçu annulé : erreur"], etat: "annule" });
  });

  it("ancien registre : l'année et le n° du registre papier", () => {
    const f = fiche({ origine: "archive_ancienne", annee: 2019, numero_registre: "411", montant_du: null, devise_du: null }, { recu: null });
    expect(parcoursActe(f, AUJOURDHUI)[0]).toEqual({ libelle: "Ancien registre", details: ["acte de 2019 · reg. n° 411"], etat: "fait" });
  });
});

describe("Informations (comme la maquette)", () => {
  it("naissance : titulaire, sexe, date et lieu, parents, demandeur, catégorie, montant payé en francs", () => {
    expect(informationsActe(fiche()).map(([l, v]) => `${l} : ${n(v)}`)).toEqual([
      "Titulaire : MUGISHO Bahati Jean",
      "Sexe : Masculin",
      "Date et lieu de naissance : 21/03/2015, Uvira",
      "Père : Mugisho Pierre",
      "Mère : Bahati Claire",
      "Demandeur : Mugisho Pierre · +243 99 000 0000",
      "Catégorie : National",
      "Montant : 30 $ — payé 85 500 FC (taux 2 850)",
    ]);
  });

  it("payé dans la même monnaie : « — payé » ; exonéré : « — exonéré »", () => {
    const enDollars = fiche({}, { recu: { ...fiche().recu!, devise_recue: "USD", montant_recu: 30, taux_applique: null } });
    expect(informationsActe(enDollars).find(([l]) => l === "Montant")?.[1]).toBe("30 $ — payé");
    const exonere = fiche({ statut: "exonere" }, { recu: null, exoneration: { motif: "Indigent", accorde_le: "2026-10-13T09:00:00Z", accorde_par: "cai" } });
    expect(informationsActe(exonere).find(([l]) => l === "Montant")?.[1]).toBe("30 $ — exonéré");
  });

  it("mariage, décès, champs vides omis, dernière correction affichée", () => {
    const mariage = fiche({
      titulaire_2_nom: "Mapendo Grace", demandeur_nom: null, demandeur_telephone: null, motif_correction: "Faute de frappe", corrige_le: "2026-10-13T09:00:00Z",
      type: { code: "MAR", libelle: "Mariage", famille: "acte_etat_civil", couleur: null, modele_fiche: "mariage", tarif_distinct_etranger: false },
      details: { date_celebration: "2026-10-10", lieu_celebration: null, temoins: "Amani, Furaha" },
    }, { recu: null });
    expect(informationsActe(mariage).map(([l]) => l)).toEqual(["Époux", "Épouse", "Date et lieu de célébration", "Témoins", "Catégorie", "Montant", "Dernière correction d'un nom"]);
    expect(informationsActe(mariage).at(-1)?.[1]).toBe("13/10/2026 — Faute de frappe");
    const deces = fiche({ type: { ...fiche().acte.type, modele_fiche: "deces" }, details: { sexe: "F", date_deces: "2026-10-12", age_au_deces: 67 } });
    expect(informationsActe(deces).slice(0, 4)).toEqual([["Défunt", "MUGISHO Bahati Jean"], ["Sexe", "Féminin"], ["Date et lieu du décès", "12/10/2026"], ["Âge au décès", "67 ans"]]);
  });
});

describe("Gestes permis selon le statut (règles de l'étape 6)", () => {
  const gestes = (statut: StatutActe) => Object.entries(actionsPossibles(fiche({ statut }))).filter(([, v]) => v).map(([k]) => k);
  it.each([
    ["enregistre", ["corrigerFiche", "transmettre", "annuler"]],
    ["en_attente_paiement", ["annuler"]],
    ["paye", ["corrigerNom", "delivrer", "annulationParLaCaisse", "refaireScan"]],
    ["exonere", ["corrigerNom", "delivrer", "annulationParLaCaisse", "refaireScan"]],
    ["delivre", ["corrigerNom", "annulationParLaCaisse", "refaireScan"]],
    ["annule", []],
  ] as const)("%s → %j", (statut, attendu) => expect(gestes(statut)).toEqual(attendu));

  it("pas encore scanné : « Scanner » à la place de « Refaire le scan »", () => {
    const sans = (statut: StatutActe) => actionsPossibles(fiche({ statut }, { document: null }));
    expect([sans("paye"), sans("delivre"), sans("en_attente_paiement"), sans("annule")].map((a) => [a.scanner, a.refaireScan])).toEqual([
      [true, false], [true, false], [false, false], [false, false],
    ]);
  });

  it("statut affiché et emplacement prévu du scan", () => {
    expect(statutAffiche(fiche())).toBe("Délivré et scanné");
    expect(statutAffiche(fiche({ statut: "paye" }, { document: null }))).toBe("Payé");
    expect(cheminPrevu(fiche())).toBe("MUL/2026/MUL-EXNAIS-2026-000123.pdf");
  });
});

describe("Versions du scan", () => {
  it("résumé d'une version : pages, taille, date, agent", () => {
    const v = { id: "d2", version: 2, chemin_stockage: "MUL/2026/MUL-EXNAIS-2026-000123-v2.pdf", importe_le: "2026-10-13T14:02:00Z", importe_par: "off",
      nb_pages: 3, taille_octets: 215_000, motif_remplacement: "Page 2 illisible", mode_import: "fichier" as const };
    expect(resumeVersion(v, { off: "Bahati Mugisho" }, AUJOURDHUI).replace(/ | /g, " ")).toBe("Version 2 · 3 pages · 210 Ko · 13/10 · 16 h 02 · Bahati Mugisho");
    expect(resumeVersion({ ...v, nb_pages: 1, importe_par: null }, {}, "2027-01-02").replace(/ | /g, " ")).toBe("Version 2 · 1 page · 210 Ko · 13/10/2026 · 16 h 02");
  });
});
