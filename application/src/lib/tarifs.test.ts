// Fichier 23 — outils communs des tarifs
import { describe, expect, it } from "vitest";
import {
  aujourdhuiUvira,
  calculerGrille,
  convertirEnCdf,
  formaterDate,
  formaterMontant,
  formaterTaux,
  lendemain,
  prixApplicable,
  type LigneTarifCommun,
  type LigneTarifEntite,
  type TypeActe,
} from "./tarifs";

// Les espaces des grands nombres sont des espaces fines insécables : on les compare comme des espaces
const n = (s: string) => s.replace(/[  ]/g, " ");

const acte = (id: string, numero: number, code: string, etranger = false): TypeActe => ({
  id, numero, code, libelle: code, famille: "attestation", tarif_distinct_etranger: etranger, couleur: null, actif: true,
});
const ATRES = acte("atres", 5, "ATRES", true);
const EXNAIS = acte("exnais", 22, "EXNAIS");
const VEUV = acte("veuv", 16, "ATVEUV");

let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});
const local = (type: string, depuis: string, prix: [number, "USD" | "CDF"] | "grille", categorie: "national" | "etranger" = "national"): LigneTarifEntite => ({
  id: `e${++k}`, entite_id: "mul", type_acte_id: type, categorie, en_vigueur_depuis: depuis, motif: null,
  ...(prix === "grille" ? { suit_grille_commune: true, montant: null, devise: null } : { suit_grille_commune: false, montant: prix[0], devise: prix[1] }),
});

const COMMUNS = [
  commun("atres", 18000, "CDF", "2026-01-01"),
  commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
  commun("exnais", 30, "USD", "2026-01-01"),
  commun("veuv", 5000, "CDF", "2026-01-01"),
];

describe("Montants, taux et dates", () => {
  it.each([
    [18000, "CDF", "18 000 FC"],
    [60000, "CDF", "60 000 FC"],
    [30, "USD", "30 $"],
    [0.5, "USD", "0,5 $"],
    [1500000, "CDF", "1 500 000 FC"],
  ] as const)("%s %s → « %s »", (m, d, attendu) => expect(n(formaterMontant(m, d))).toBe(attendu));

  it("taux : « 2 850 FC pour 1 $ »", () => expect(n(formaterTaux(2850))).toBe("2 850 FC pour 1 $"));

  it("conversion en francs, arrondie au franc (comme la base)", () => {
    expect(convertirEnCdf(30, "USD", 2850)).toBe(85500);
    // Migration 24 : dollars × taux arrondis à la centaine la plus proche (comme la base)
    expect(convertirEnCdf(0.5, "USD", 2851)).toBe(1400);
    expect(convertirEnCdf(2.5, "USD", 2873)).toBe(7200);
    expect(convertirEnCdf(25, "USD", 2850)).toBe(71300);
    expect(convertirEnCdf(10, "USD", 2814)).toBe(28100);
    expect(convertirEnCdf(30, "USD", 2873)).toBe(86200);
    expect(convertirEnCdf(0.01, "USD", 600)).toBe(100);
    expect(convertirEnCdf(1.15, "USD", 1000)).toBe(1200); // 1 150 : la moitié monte, sans erreur de virgule
    expect(convertirEnCdf(18000.4, "CDF", null)).toBe(18000);
    expect(convertirEnCdf(18000, "CDF", null)).toBe(18000);
    expect(convertirEnCdf(30, "USD", null)).toBeNull();
  });

  it("date du jour à l'heure d'Uvira (23 h 30 à Lagos = le lendemain à Uvira)", () => {
    expect(aujourdhuiUvira(new Date("2026-10-14T10:00:00Z"))).toBe("2026-10-14");
    expect(aujourdhuiUvira(new Date("2026-10-14T22:30:00Z"))).toBe("2026-10-15");
  });
  it.each([["2026-10-14", "2026-10-15"], ["2026-10-31", "2026-11-01"], ["2026-12-31", "2027-01-01"], ["2028-02-28", "2028-02-29"]])(
    "lendemain de %s → %s", (d, attendu) => expect(lendemain(d)).toBe(attendu),
  );
  it("affichage des dates", () => expect(formaterDate("2026-11-12")).toBe("12/11/2026"));
});

describe("Le bon prix (mêmes règles que la base)", () => {
  it("grille commune par défaut", () => {
    expect(prixApplicable(EXNAIS, "national", COMMUNS, [], "2026-10-14")).toMatchObject({ montant: 30, devise: "USD", source: "commune" });
  });
  it("acte sans tarif Étrangers distinct : un étranger paie le tarif national", () => {
    expect(prixApplicable(EXNAIS, "etranger", COMMUNS, [], "2026-10-14")).toMatchObject({ montant: 30, devise: "USD" });
  });
  it("acte avec tarif Étrangers : chacun son tarif", () => {
    expect(prixApplicable(ATRES, "national", COMMUNS, [], "2026-10-14")?.montant).toBe(18000);
    expect(prixApplicable(ATRES, "etranger", COMMUNS, [], "2026-10-14")?.montant).toBe(39000);
  });
  it("l'ajustement de l'entité l'emporte… à partir de sa date seulement", () => {
    const aj = [local("veuv", "2026-09-01", [4000, "CDF"])];
    expect(prixApplicable(VEUV, "national", COMMUNS, aj, "2026-08-31")).toMatchObject({ montant: 5000, source: "commune" });
    expect(prixApplicable(VEUV, "national", COMMUNS, aj, "2026-09-01")).toMatchObject({ montant: 4000, source: "entite" });
  });
  it("retour à la grille commune : l'ajustement cesse", () => {
    const aj = [local("veuv", "2026-09-01", [4000, "CDF"]), local("veuv", "2026-10-01", "grille")];
    expect(prixApplicable(VEUV, "national", COMMUNS, aj, "2026-10-14")).toMatchObject({ montant: 5000, source: "commune" });
  });
  it("un nouveau tarif commun ne touche pas une entité qui a son propre ajustement", () => {
    const communs = [...COMMUNS, commun("veuv", 6000, "CDF", "2026-10-01")];
    const aj = [local("veuv", "2026-09-01", [4000, "CDF"])];
    expect(prixApplicable(VEUV, "national", communs, aj, "2026-10-14")?.montant).toBe(4000);
    expect(prixApplicable(VEUV, "national", communs, [], "2026-10-14")?.montant).toBe(6000);
  });
});

describe("La grille complète", () => {
  const AUJOURDHUI = "2026-10-14";

  it("une ligne par acte, dans l'ordre des numéros ; deux catégories seulement pour les actes qui en ont deux", () => {
    const grille = calculerGrille([EXNAIS, ATRES, VEUV], COMMUNS, [], AUJOURDHUI);
    expect(grille.map((l) => l.acte.numero)).toEqual([5, 16, 22]);
    expect(grille[0].categories.map((c) => c.categorie)).toEqual(["national", "etranger"]);
    expect(grille[2].categories.map((c) => c.categorie)).toEqual(["national"]);
  });

  it("ajustement en vigueur + changement programmé (comme la maquette : « 20 000 FC à partir du 12/11/2026 »)", () => {
    const aj = [local("atres", "2026-11-12", [20000, "CDF"])];
    const [atres] = calculerGrille([ATRES], COMMUNS, aj, AUJOURDHUI);
    const national = atres.categories[0];
    expect(national.applique).toMatchObject({ montant: 18000, source: "commune" });
    expect(national.ajustement).toBeNull();
    expect(national.ajustementsAVenir).toHaveLength(1);
    expect(national.changements).toEqual([{ date: "2026-11-12", prix: { montant: 20000, devise: "CDF", source: "entite", depuis: "2026-11-12" } }]);
    expect(atres.categories[1].changements).toEqual([]); // le tarif Étrangers ne bouge pas
  });

  it("nouveau tarif commun programmé, mais l'entité garde son ajustement : aucun changement pour elle", () => {
    const communs = [...COMMUNS, commun("veuv", 6000, "CDF", "2026-12-01")];
    const aj = [local("veuv", "2026-09-01", [4000, "CDF"])];
    const [veuv] = calculerGrille([VEUV], communs, aj, AUJOURDHUI);
    expect(veuv.categories[0].ajustement).toMatchObject({ montant: 4000, depuis: "2026-09-01" });
    expect(veuv.categories[0].communsAVenir).toHaveLength(1);
    expect(veuv.categories[0].changements).toEqual([]);
  });

  it("retour programmé à la grille commune : le changement est annoncé", () => {
    const aj = [local("veuv", "2026-09-01", [4000, "CDF"]), local("veuv", "2026-11-01", "grille")];
    const [veuv] = calculerGrille([VEUV], COMMUNS, aj, AUJOURDHUI);
    expect(veuv.categories[0].changements).toEqual([
      { date: "2026-11-01", prix: { montant: 5000, devise: "CDF", source: "commune", depuis: "2026-01-01" } },
    ]);
  });
});
