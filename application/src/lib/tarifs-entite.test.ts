// Fichier 25 — tarifs de l'entité : tableau, saisie, aperçu, ajustements programmés
import { describe, expect, it } from "vitest";
import { MESSAGES_GRILLE } from "./grille-commune";
import {
  ajustementsProgrammes,
  apercuAjustement,
  lignesTarifsEntite,
  texteChangement,
  titreTarifs,
  validerAjustement,
  type SaisieAjustement,
} from "./tarifs-entite";
import type { DonneesTarifaires, LigneTarifCommun, LigneTarifEntite, TypeActe } from "./tarifs";

const n = (s: string) => s.replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, etranger = false, actif = true): TypeActe => ({
  id, numero, code, libelle: `Libellé ${code}`, famille: "attestation", tarif_distinct_etranger: etranger, couleur: null, actif,
});
const ATRES = acte("atres", 5, "ATRES", true);
const VEUV = acte("veuv", 16, "ATVEUV");
const EXNAIS = acte("exnais", 22, "EXNAIS");
const ANCIEN = acte("ancien", 30, "ANC", false, false);
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});
const local = (entite: string, type: string, depuis: string, prix: [number, "USD" | "CDF"] | "grille", categorie: "national" | "etranger" = "national"): LigneTarifEntite => ({
  id: `e${++k}`, entite_id: entite, type_acte_id: type, categorie, en_vigueur_depuis: depuis, motif: "Décision n° 1",
  ...(prix === "grille" ? { suit_grille_commune: true, montant: null, devise: null } : { suit_grille_commune: false, montant: prix[0], devise: prix[1] }),
});
const DONNEES: DonneesTarifaires = {
  actes: [EXNAIS, ATRES, VEUV, ANCIEN],
  communs: [
    commun("atres", 18000, "CDF", "2026-01-01"),
    commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
    commun("veuv", 5000, "CDF", "2026-01-01"),
    commun("exnais", 30, "USD", "2026-01-01"),
    commun("exnais", 35, "USD", "2027-01-01"),
    commun("ancien", 1000, "CDF", "2026-01-01"),
  ],
  ajustements: [
    local("mul", "atres", "2026-11-12", [20000, "CDF"]),
    local("mul", "veuv", "2026-09-01", [4000, "CDF"]),
    local("kav", "veuv", "2026-09-01", [3000, "CDF"]), // une autre entité : sans effet pour Mulongwe
  ],
};

it("titre : « Tarifs de la commune de Mulongwe », « Tarifs de la chefferie des Bavira »", () => {
  expect(titreTarifs("Commune de Mulongwe")).toBe("Tarifs de la commune de Mulongwe");
  expect(titreTarifs("Chefferie des Bavira")).toBe("Tarifs de la chefferie des Bavira");
});

describe("Tableau (maquette « Officier — Tarifs de l'entité »)", () => {
  const lignes = lignesTarifsEntite(DONNEES, "mul", AUJOURDHUI);
  const ligne = (code: string, cat = "national") => lignes.find((l) => l.acte.code === code && l.categorie === cat)!;

  it("une ligne par acte et par catégorie, dans l'ordre ; les actes retirés n'apparaissent pas", () => {
    expect(lignes.map((l) => `${l.acte.code} ${l.categorie}`)).toEqual(["ATRES national", "ATRES etranger", "ATVEUV national", "EXNAIS national"]);
  });

  it("ATRES : 18 000 FC aujourd'hui, « 20 000 FC à partir du 12/11/2026 »", () => {
    expect(ligne("ATRES")).toMatchObject({ distinct: true, commun: { montant: 18000 }, applique: { montant: 18000, source: "commune" }, ajustement: null });
    expect(ligne("ATRES").changements.map((c) => n(texteChangement(c)))).toEqual(["20 000 FC à partir du 12/11/2026"]);
    expect(ligne("ATRES", "etranger").changements).toEqual([]);
  });

  it("ATVEUV : ajusté à 4 000 FC depuis le 01/09/2026 (l'ajustement de Kavimvira ne compte pas)", () => {
    expect(ligne("ATVEUV")).toMatchObject({ commun: { montant: 5000 }, applique: { montant: 4000, source: "entite" }, ajustement: { depuis: "2026-09-01" } });
  });

  it("un changement de la grille commune touche aussi l'entité : « 35 $ (grille commune) à partir du 01/01/2027 »", () => {
    expect(ligne("EXNAIS").changements.map((c) => n(texteChangement(c)))).toEqual(["35 $ (grille commune) à partir du 01/01/2027"]);
  });
});

describe("Saisie", () => {
  const saisie = (s: Partial<SaisieAjustement> = {}): SaisieAjustement => ({
    mode: "prix", acteId: "atres", categorie: "national", montant: "20 000", devise: "CDF", date: "2026-12-01", motif: "Décision du Bourgmestre n° 14", ...s,
  });
  const actes = DONNEES.actes;

  it("ajustement de prix : mêmes contrôles que la grille commune", () => {
    expect(validerAjustement(saisie(), actes, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { mode: "prix", montant: 20000, devise: "CDF" } });
    expect(validerAjustement(saisie({ date: AUJOURDHUI }), actes, AUJOURDHUI)).toMatchObject({ ok: false, champ: "date" });
    expect(validerAjustement(saisie({ montant: "" }), actes, AUJOURDHUI)).toMatchObject({ ok: false, champ: "montant" });
    expect(validerAjustement(saisie({ motif: "" }), actes, AUJOURDHUI)).toMatchObject({ ok: false, message: MESSAGES_GRILLE.motif });
    expect(validerAjustement(saisie({ acteId: "ancien" }), actes, AUJOURDHUI)).toMatchObject({ ok: false, champ: "acte" });
  });

  it("retour à la grille : pas de montant demandé, mais une date et un motif", () => {
    expect(validerAjustement(saisie({ mode: "grille", montant: "", devise: "" }), actes, AUJOURDHUI)).toEqual({
      ok: true,
      valeurs: { mode: "grille", acte: ATRES, categorie: "national", date: "2026-12-01", motif: "Décision du Bourgmestre n° 14" },
    });
    expect(validerAjustement(saisie({ mode: "grille", date: "2026-10-01" }), actes, AUJOURDHUI)).toMatchObject({ ok: false, champ: "date" });
    expect(validerAjustement(saisie({ mode: "autre" as "prix" }), actes, AUJOURDHUI)).toMatchObject({ ok: false });
  });
});

describe("Aperçu avant confirmation", () => {
  const valide = (s: Partial<SaisieAjustement>) => {
    const r = validerAjustement({ mode: "prix", acteId: "veuv", categorie: "national", montant: "4 500", devise: "CDF", date: "2026-12-01", motif: "Décision", ...s }, DONNEES.actes, AUJOURDHUI);
    if (!r.ok) throw new Error(r.message);
    return r.valeurs;
  };

  it("ajustement : prix demandé la veille → nouveau prix", () => {
    expect(apercuAjustement(valide({}), DONNEES, "mul")).toEqual({
      avant: { montant: 4000, devise: "CDF", source: "entite", depuis: "2026-09-01" },
      apres: { montant: 4500, devise: "CDF", source: "entite", depuis: "2026-12-01" },
      sansEffet: false, doublon: false, dejaSurGrille: false,
    });
  });

  it("retour à la grille : 4 000 FC → 5 000 FC (grille commune)", () => {
    expect(apercuAjustement(valide({ mode: "grille" }), DONNEES, "mul")).toMatchObject({
      avant: { montant: 4000, source: "entite" }, apres: { montant: 5000, source: "commune" }, dejaSurGrille: false,
    });
  });

  it("retour à la grille alors qu'on la suit déjà : signalé", () => {
    expect(apercuAjustement(valide({ mode: "grille", acteId: "exnais" }), DONNEES, "mul").dejaSurGrille).toBe(true);
    // Mulongwe n'a pas d'ajustement sur ATVEUV à Kalundu
    expect(apercuAjustement(valide({ mode: "grille" }), DONNEES, "kal").dejaSurGrille).toBe(true);
  });

  it("même prix qu'avant : sans effet ; même date qu'un changement programmé : doublon", () => {
    expect(apercuAjustement(valide({ montant: "4000" }), DONNEES, "mul").sansEffet).toBe(true);
    expect(apercuAjustement(valide({ acteId: "atres", date: "2026-11-12", montant: "21000" }), DONNEES, "mul").doublon).toBe(true);
  });
});

describe("Ajustements programmés", () => {
  it("seulement ceux de l'entité, pas encore en vigueur, avec le prix d'avant et d'après", () => {
    const donnees = { ...DONNEES, ajustements: [...DONNEES.ajustements, local("mul", "veuv", "2027-03-01", "grille"), local("kav", "atres", "2026-12-01", [1, "CDF"])] };
    expect(ajustementsProgrammes(donnees, "mul", AUJOURDHUI).map((a) => [a.ligne.en_vigueur_depuis, a.acte.code, a.avant?.montant, a.apres?.montant, a.apres?.source])).toEqual([
      ["2026-11-12", "ATRES", 18000, 20000, "entite"],
      ["2027-03-01", "ATVEUV", 4000, 5000, "commune"],
    ]);
  });
});
