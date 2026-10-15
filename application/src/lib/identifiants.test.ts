import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOMAINE_COMPTES,
  adresseInterne,
  estNomUtilisateurValide,
  nomDepuisAdresse,
  normaliserNomUtilisateur,
} from "./identifiants";

describe("Noms d'utilisateur", () => {
  it("la règle de format est exactement celle de la base (fichier 02)", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../supabase/migrations/20261013000200_entites_et_utilisateurs.sql"),
      "utf8",
    );
    expect(sql).toContain("nom_utilisateur ~ '^[a-z0-9]+(\\.[a-z0-9]+)*$'");
    expect(sql).toContain("length(nom_utilisateur) between 3 and 50");
  });

  it("une saisie est mise au propre (espaces, majuscules)", () => {
    expect(normaliserNomUtilisateur("  Mulongwe.Officier ")).toBe("mulongwe.officier");
  });

  it.each([
    ["mulongwe.officier", true],
    ["bavira.caissier.ancien20261013.2", true],
    ["admin.cdjp", true],
    ["ab", false],
    ["mulongwe officier", false],
    ["mulongwe..officier", false],
    [".mulongwe", false],
    ["mulongwe-officier", false],
    ["mulongwe.officier@", false],
    ["a".repeat(51), false],
  ])("« %s » est %s", (nom, attendu) => {
    expect(estNomUtilisateurValide(nom)).toBe(attendu);
  });
});

describe("Adresses internes", () => {
  it("un nom d'utilisateur donne une adresse interne", () => {
    expect(adresseInterne(" Mulongwe.Officier ")).toBe(`mulongwe.officier@${DOMAINE_COMPTES}`);
  });

  it("un nom invalide est refusé avec un message clair", () => {
    expect(() => adresseInterne("mulongwe officier")).toThrow("Nom d'utilisateur invalide");
  });

  it("l'adresse interne permet de retrouver le nom", () => {
    expect(nomDepuisAdresse(`kalundu.caissier@${DOMAINE_COMPTES}`)).toBe("kalundu.caissier");
  });

  it("une adresse d'un autre domaine ne donne aucun nom", () => {
    expect(nomDepuisAdresse("kalundu.caissier@gmail.com")).toBeNull();
  });
});
