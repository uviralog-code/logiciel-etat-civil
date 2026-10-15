// Fichier 27 — catalogue des actes : liste, propositions, contrôles
import { describe, expect, it } from "vitest";
import {
  couleurProposee,
  lignesCatalogue,
  nettoyerCode,
  prochainNumero,
  validerCorrection,
  validerNouveauType,
  type ModeleFiche,
  type SaisieTypeActe,
} from "./catalogue";
import type { LigneTarifCommun, TypeActe } from "./tarifs";

const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, libelle: string, etranger = false, actif = true): TypeActe & { modele_fiche: ModeleFiche } => ({
  id, numero, code, libelle, famille: "attestation", tarif_distinct_etranger: etranger, couleur: "#1565C0", actif, modele_fiche: "generique",
});
const ATRES = acte("atres", 5, "ATRES", "Attestation de résidence", true);
const EXNAIS = acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance");
const CVIE = acte("cvie", 26, "CVIE", "Certificat de vie", false, false);
const NOUVEAU = acte("neuf", 27, "ATBVM", "Attestation de bonne vie et mœurs");
const ACTES = [EXNAIS, ATRES, CVIE, NOUVEAU];
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});

describe("Liste du catalogue", () => {
  it("dans l'ordre des numéros, avec le prix du jour ; un type tout neuf montre sa date de disponibilité", () => {
    const communs = [
      commun("atres", 18000, "CDF", "2026-01-01"), commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
      commun("exnais", 30, "USD", "2026-01-01"), commun("exnais", 35, "USD", "2027-01-01"),
      commun("cvie", 18000, "CDF", "2026-01-01"), commun("neuf", 12000, "CDF", "2026-10-15"),
    ];
    expect(lignesCatalogue(ACTES, communs, AUJOURDHUI).map((l) => [l.acte.code, l.national?.montant ?? null, l.etranger?.montant ?? null, l.disponibleLe, l.acte.actif])).toEqual([
      ["ATRES", 18000, 39000, null, true],
      ["EXNAIS", 30, null, null, true],
      ["CVIE", 18000, null, null, false],
      ["ATBVM", null, null, "2026-10-15", true],
    ]);
  });
});

describe("Propositions", () => {
  it("numéro suivant, code nettoyé, couleur selon la fiche ou la famille", () => {
    expect(prochainNumero(ACTES)).toBe(28);
    expect(nettoyerCode("atbvm")).toBe("ATBVM");
    expect(nettoyerCode("Décès-2")).toBe("DECES");
    expect(couleurProposee("acte_etat_civil", "naissance")).toBe("#2E7D32");
    expect(couleurProposee("extrait", "mariage")).toBe("#6A1B9A");
    expect(couleurProposee("certificat", "generique")).toBe("#00727C");
    expect(couleurProposee("autorisation", "generique")).toBe("#BF360C");
    expect(couleurProposee("acte_etat_civil", "generique")).toBe("#1565C0");
  });
});

describe("Nouveau type d'acte", () => {
  const saisie = (s: Partial<SaisieTypeActe> = {}): SaisieTypeActe => ({
    numero: "28", code: "ATSEP", libelle: "Attestation de séparation", famille: "attestation", modele: "generique", couleur: "#1565c0",
    distinctEtranger: false, montantNational: "10 000", deviseNational: "CDF", montantEtranger: "", deviseEtranger: "CDF",
    date: "2026-10-15", motif: "Arrêté n° 3/2026", ...s,
  });
  const champ = (s: Partial<SaisieTypeActe>) => {
    const r = validerNouveauType(saisie(s), ACTES, AUJOURDHUI);
    return r.ok ? "ok" : r.champ;
  };

  it("saisie correcte : valeurs nettoyées", () => {
    expect(validerNouveauType(saisie({ libelle: "  Attestation   de séparation " }), ACTES, AUJOURDHUI)).toEqual({
      ok: true,
      valeurs: {
        numero: 28, code: "ATSEP", libelle: "Attestation de séparation", famille: "attestation", modele: "generique", couleur: "#1565C0",
        distinctEtranger: false, national: { montant: 10000, devise: "CDF" }, etranger: null, date: "2026-10-15", motif: "Arrêté n° 3/2026",
      },
    });
  });

  it("numéro : entier, libre (même celui d'un acte retiré reste pris)", () => {
    expect(champ({ numero: "2,5" })).toBe("numero");
    expect(champ({ numero: "0" })).toBe("numero");
    expect(validerNouveauType(saisie({ numero: "26" }), ACTES, AUJOURDHUI)).toMatchObject({ champ: "numero", message: "Le numéro 26 est déjà celui de « Certificat de vie »." });
  });

  it("code : 2 à 6 lettres majuscules, libre", () => {
    expect(champ({ code: "A" })).toBe("code");
    expect(champ({ code: "ATTESTA" })).toBe("code");
    expect(champ({ code: "AT1" })).toBe("code");
    expect(validerNouveauType(saisie({ code: "EXNAIS" }), ACTES, AUJOURDHUI)).toMatchObject({ champ: "code", message: expect.stringContaining("déjà celui de « Extrait d'acte de naissance »") });
  });

  it("libellé : obligatoire, unique (sans tenir compte des accents ni des majuscules)", () => {
    expect(champ({ libelle: "ab" })).toBe("libelle");
    expect(champ({ libelle: "CERTIFICAT DE VIE" })).toBe("libelle");
    expect(champ({ libelle: "Attestation de residence" })).toBe("libelle");
  });

  it("famille, fiche, couleur", () => {
    expect(champ({ famille: "autre" })).toBe("famille");
    expect(champ({ modele: "autre" })).toBe("modele");
    expect(champ({ couleur: "bleu" })).toBe("couleur");
  });

  it("prix : National obligatoire ; Étranger seulement s'il est distinct", () => {
    expect(champ({ montantNational: "" })).toBe("montantNational");
    expect(champ({ distinctEtranger: true })).toBe("montantEtranger");
    expect(validerNouveauType(saisie({ distinctEtranger: true, montantEtranger: "25", deviseEtranger: "USD" }), ACTES, AUJOURDHUI)).toMatchObject({
      ok: true, valeurs: { etranger: { montant: 25, devise: "USD" } },
    });
    expect(validerNouveauType(saisie({ montantEtranger: "25" }), ACTES, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { etranger: null } });
  });

  it("date au plus tôt demain, référence obligatoire", () => {
    expect(champ({ date: AUJOURDHUI })).toBe("date");
    expect(champ({ motif: "" })).toBe("motif");
  });
});

describe("Correction", () => {
  it("libellé, famille, couleur ; le libellé reste unique, sauf pour l'acte lui-même", () => {
    expect(validerCorrection("exnais", { libelle: "Extrait d'acte de naissance", famille: "extrait", couleur: "#374151" }, ACTES)).toEqual({
      ok: true, valeurs: { libelle: "Extrait d'acte de naissance", famille: "extrait", couleur: "#374151" },
    });
    expect(validerCorrection("exnais", { libelle: "Certificat de vie", famille: "extrait", couleur: "#374151" }, ACTES)).toMatchObject({ ok: false, champ: "libelle" });
    expect(validerCorrection("inconnu", { libelle: "x y z", famille: "extrait", couleur: "#374151" }, ACTES)).toMatchObject({ ok: false });
  });
});
