// Fichier 29 — « Nouvel acte » : cartes par famille, filtre, prix affiché, ID prévu
import { describe, expect, it } from "vitest";
import { cartesParFamille, filtrerGroupes, idPrevu, prixAffiche, prixSelonCategorie } from "./nouvel-acte";
import { lignesTarifsEntite } from "./tarifs-entite";
import type { DonneesTarifaires, LigneTarifCommun, TypeActe } from "./tarifs";

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, libelle: string, famille: TypeActe["famille"], etranger = false): TypeActe => ({
  id, numero, code, libelle, famille, tarif_distinct_etranger: etranger, couleur: null, actif: true,
});
let k = 0;
const commun = (type: string, montant: number, devise: "USD" | "CDF", depuis: string, categorie: "national" | "etranger" = "national"): LigneTarifCommun => ({
  id: `c${++k}`, type_acte_id: type, categorie, montant, devise, en_vigueur_depuis: depuis, motif: null,
});
const DONNEES: DonneesTarifaires = {
  actes: [
    acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance", "extrait"),
    acte("dec", 2, "DEC", "Acte de décès", "acte_etat_civil"),
    acte("atres", 5, "ATRES", "Attestation de résidence", "attestation", true),
    acte("atcel", 8, "ATCEL", "Attestation de célibat", "attestation", true),
    acte("neuf", 27, "ATSEP", "Attestation de séparation", "attestation"),
  ],
  communs: [
    commun("exnais", 30, "USD", "2026-01-01"), commun("dec", 15000, "CDF", "2026-01-01"),
    commun("atres", 18000, "CDF", "2026-01-01"), commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
    commun("atcel", 9000, "CDF", "2026-01-01"), commun("atcel", 30000, "CDF", "2026-01-01", "etranger"),
    commun("neuf", 10000, "CDF", "2026-10-15"),
  ],
  ajustements: [{ id: "e1", entite_id: "mul", type_acte_id: "atres", categorie: "national", suit_grille_commune: false, montant: 20000, devise: "CDF", en_vigueur_depuis: "2026-09-01", motif: null }],
};
const LIGNES = lignesTarifsEntite(DONNEES, "mul", AUJOURDHUI);

describe("Cartes du choix du type (maquette)", () => {
  const groupes = cartesParFamille(LIGNES);

  it("familles dans l'ordre de la maquette, actes par numéro, prix appliqué dans l'entité", () => {
    expect(groupes.map((g) => [g.nom, g.cartes.map((c) => `${c.acte.code} ${n(c.prix)}`)])).toEqual([
      ["Actes d'état civil", ["DEC 15 000 FC"]],
      ["Extraits", ["EXNAIS 30 $"]],
      ["Attestations", ["ATRES National 20 000 FC · Étranger 39 000 FC", "ATCEL National 9 000 FC · Étranger 30 000 FC", "ATSEP —"]],
    ]);
  });

  it("un acte tout neuf, sans prix aujourd'hui : « disponible le … »", () => {
    expect(groupes[2].cartes.find((c) => c.acte.code === "ATSEP")?.disponibleLe).toBe("2026-10-15");
    expect(groupes[1].cartes[0].disponibleLe).toBeNull();
  });

  it("filtre : sans accents ni majuscules, par nom, code, numéro ou famille", () => {
    const codes = (f: string) => filtrerGroupes(groupes, f).flatMap((g) => g.cartes.map((c) => c.acte.code));
    expect(codes("celibat")).toEqual(["ATCEL"]);
    expect(codes("NAISS")).toEqual(["EXNAIS"]);
    expect(codes("exnais")).toEqual(["EXNAIS"]);
    expect(codes("22")).toEqual(["EXNAIS"]);
    expect(codes("attestation de")).toEqual(["ATRES", "ATCEL", "ATSEP"]);
    expect(codes("extraits")).toEqual(["EXNAIS"]);
    expect(codes("  ")).toHaveLength(5);
    expect(codes("passeport")).toEqual([]);
  });
});

describe("Fiche : prix, équivalent, ID prévu", () => {
  it("prix selon la nationalité ; un acte sans tarif Étrangers a un seul prix", () => {
    expect(prixSelonCategorie(LIGNES, "atres", "etranger")).toEqual({ montant: 39000, devise: "CDF" });
    expect(prixSelonCategorie(LIGNES, "atres", "national")).toEqual({ montant: 20000, devise: "CDF" });
    expect(prixSelonCategorie(LIGNES, "exnais", "etranger")).toEqual({ montant: 30, devise: "USD" });
    expect(prixSelonCategorie(LIGNES, "neuf", "national")).toBeNull();
  });

  it("équivalent en francs au taux du jour (comme la maquette) ; sans taux, un avertissement", () => {
    const p = prixAffiche({ montant: 30, devise: "USD" }, 2850)!;
    expect([n(p.montant), n(p.equivalent)]).toEqual(["30 $", "soit 85 500 FC au taux du jour (2 850 FC pour 1 $)"]);
    expect(prixAffiche({ montant: 30, devise: "USD" }, null)?.equivalent).toContain("pas encore saisi de taux");
    expect(prixAffiche({ montant: 18000, devise: "CDF" }, 2850)?.equivalent).toBeNull();
    expect(prixAffiche(null, 2850)).toBeNull();
  });

  it("ID prévu : « MUL-EXNAIS-2026-000125 »", () => {
    expect(idPrevu("MUL", "EXNAIS", 2026, 124)).toBe("MUL-EXNAIS-2026-000125");
    expect(idPrevu("BAV", "DEC", 2027, 0)).toBe("BAV-DEC-2027-000001");
  });
});
