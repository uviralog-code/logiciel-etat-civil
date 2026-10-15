import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COULEURS,
  CONTRASTE_MINIMUM,
  FAMILLES,
  ROLES,
  STATUTS,
  contraste,
} from "./charte";

const migrations = resolve(__dirname, "../../../supabase/migrations");
const lire = (fichier: string) => readFileSync(resolve(migrations, fichier), "utf8");

/** Valeurs d'une liste fixe déclarée dans la base (create type … as enum). */
function valeursEnum(sql: string, nom: string): string[] {
  const bloc = sql.match(new RegExp(`create type public\\.${nom} as enum \\(([\\s\\S]*?)\\);`));
  if (!bloc) throw new Error(`Liste ${nom} introuvable dans la base`);
  return [...bloc[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("Calcul du contraste", () => {
  it("noir sur blanc donne le contraste maximal (21)", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });
  it("une couleur sur elle-même donne 1", () => {
    expect(contraste("#0B3D91", "#0B3D91")).toBeCloseTo(1, 5);
  });
  it("l'ordre des couleurs n'a pas d'importance", () => {
    expect(contraste("#0B3D91", "#FFFFFF")).toBeCloseTo(contraste("#FFFFFF", "#0B3D91"), 10);
  });
  it("refuse une couleur mal écrite", () => {
    expect(() => contraste("bleu", "#FFFFFF")).toThrow("Couleur invalide");
  });
});

describe("Charte identique à la base de données", () => {
  const fondations = lire("20261013000100_fondations.sql");

  it("les statuts d'acte sont exactement ceux de la base", () => {
    expect(Object.keys(STATUTS)).toEqual(valeursEnum(fondations, "statut_acte"));
  });
  it("les familles d'actes sont exactement celles de la base", () => {
    expect(Object.keys(FAMILLES).sort()).toEqual(valeursEnum(fondations, "famille_acte").sort());
  });
  it("les rôles sont exactement ceux de la base", () => {
    expect(Object.keys(ROLES)).toEqual(valeursEnum(fondations, "role_utilisateur"));
  });
});

describe("Lisibilité (contraste d'au moins 4,5)", () => {
  it.each(Object.entries(STATUTS))("pastille de statut « %s »", (_, s) => {
    expect(contraste(s.texte, s.fond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
  });

  it.each(Object.entries(FAMILLES))("texte blanc sur la famille « %s »", (_, f) => {
    expect(contraste("#FFFFFF", f.couleur)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
  });

  it("texte blanc sur la couleur de chacun des 26 actes enregistrés dans la base", () => {
    // Couleurs installées au fichier 11, corrigées au fichier 12
    const corrections: Record<string, string> = {};
    for (const m of lire("20261013001200_ajustements_maquettes.sql").matchAll(
      /couleur = '(#[0-9A-F]{6})' where famille = '\w+'\s+and couleur = '(#[0-9A-F]{6})'/g,
    )) {
      corrections[m[2]] = m[1];
    }
    const couleurs = new Set(
      [...lire("20261013001100_donnees_initiales.sql").matchAll(/'(#[0-9A-F]{6})'\)/g)].map(
        (m) => corrections[m[1]] ?? m[1],
      ),
    );
    expect(couleurs.size).toBeGreaterThanOrEqual(5);
    for (const couleur of couleurs) {
      expect(contraste("#FFFFFF", couleur), `couleur ${couleur}`).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMUM,
      );
    }
  });

  it("textes principaux et secondaires sur le fond de page", () => {
    expect(contraste(COULEURS.encre, COULEURS.fond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
    expect(contraste(COULEURS.texteDoux, COULEURS.fond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
    expect(contraste("#FFFFFF", COULEURS.bleuEtat)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
  });

  it("messages de succès, d'attention et d'erreur", () => {
    expect(contraste(COULEURS.succesTexte, COULEURS.succesFond)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COULEURS.attentionTexte, COULEURS.attentionFond)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COULEURS.erreurTexte, COULEURS.erreurFond)).toBeGreaterThanOrEqual(4.5);
  });
});
