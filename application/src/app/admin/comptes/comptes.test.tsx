// Fichier 20 — affichage du tableau des comptes
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { organiserComptes, type LigneCompte } from "@/lib/comptes";
import { TableauComptes } from "./tableau-comptes";

vi.mock("./actions", () => ({ reinitialiser: vi.fn(), desactiver: vi.fn(), creerCompte: vi.fn() }));

afterEach(cleanup);

const MAINTENANT = new Date("2026-10-14T08:00:00Z");
const ENTITES = [
  { id: "1", code: "MUL", nom: "Commune de Mulongwe" },
  { id: "2", code: "BAV", nom: "Chefferie des Bavira" },
];
const base = { doit_changer_mot_de_passe: false, desactive_le: null, actif: true } as const;
const comptes: LigneCompte[] = [
  { ...base, id: "a", nom_utilisateur: "mulongwe.officier", nom_complet: "Bahati Mugisho", role: "officier", derniere_connexion_en_ligne: "2026-10-14T05:52:00Z", entite: { code: "MUL", nom: "Commune de Mulongwe" } },
  { ...base, id: "b", nom_utilisateur: "mulongwe.caissier", nom_complet: "Neema Furaha", role: "caissier", derniere_connexion_en_ligne: "2026-10-08T06:00:00Z", entite: { code: "MUL", nom: "Commune de Mulongwe" } },
  { ...base, id: "c", nom_utilisateur: "bavira.officier", nom_complet: "Claire Bahati", role: "officier", derniere_connexion_en_ligne: "2026-10-14T07:10:00Z", entite: { code: "BAV", nom: "Chefferie des Bavira" } },
  { ...base, id: "d", nom_utilisateur: "bavira.caissier.ancien20261005", nom_complet: "Jean Kabila", role: "caissier", actif: false, desactive_le: "2026-10-05T09:00:00Z", derniere_connexion_en_ligne: "2026-10-02T09:00:00Z", entite: { code: "BAV", nom: "Chefferie des Bavira" } },
];

describe("Tableau des comptes", () => {
  it("colonnes de la maquette", () => {
    render(<TableauComptes liste={organiserComptes(comptes, ENTITES, MAINTENANT)} />);
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Nom d'utilisateur", "Nom", "Rôle", "Entité", "Dernière connexion en ligne", "État", "Actions",
    ]);
  });

  it("une ligne par compte, avec son état ; un poste vide « À créer » ; l'ancien compte grisé", () => {
    render(<TableauComptes liste={organiserComptes(comptes, ENTITES, MAINTENANT)} />);
    const lignes = screen.getAllByRole("row").slice(1).map((l) => within(l).getAllByRole("cell").map((c) => c.textContent));
    expect(lignes).toEqual([
      ["mulongwe.officier", "Bahati Mugisho", "Officier", "Mulongwe", "aujourd'hui 07 h 52", "Actif", "Mot de passe…Désactiver"],
      ["mulongwe.caissier", "Neema Furaha", "Caissier", "Mulongwe", "il y a 6 jours", "Hors-ligne : reste 1 jour", "Mot de passe…Désactiver"],
      ["bavira.officier", "Claire Bahati", "Officier", "Bavira", "aujourd'hui 09 h 10", "Actif", "Mot de passe…Désactiver"],
      ["—", "—", "Caissier", "Bavira", "—", "À créer", "Créer"],
      ["bavira.caissier.ancien20261005", "Jean Kabila", "Caissier", "Bavira", "02/10/2026", "Désactivé le 05/10", ""],
    ]);
    expect(document.querySelector('[data-rangee="desactive"]')?.className).toContain("text-[#6b7280]");
  });

  it("« Créer » sur un poste vide ouvre le formulaire sur ce poste", () => {
    render(<TableauComptes liste={organiserComptes(comptes, ENTITES, MAINTENANT)} />);
    const lien = screen.getByRole("link", { name: "Créer le compte caissier de Bavira" });
    expect(lien.getAttribute("href")).toBe("/admin/comptes?creer=BAV-caissier#creer-compte");
  });

  it("résumé sous le tableau", () => {
    render(<TableauComptes liste={organiserComptes(comptes, ENTITES, MAINTENANT)} />);
    expect(screen.getByText(/3 comptes actifs · 1 poste à pourvoir · 1 ancien compte désactivé · 1 à surveiller/)).toBeTruthy();
  });
});

describe("Écran d'erreur", () => {
  it("en français, avec « Réessayer » et le code à transmettre au service technique", async () => {
    const { default: Erreur } = await import("@/app/error");
    let relance = 0;
    render(<Erreur error={Object.assign(new Error("x"), { digest: "123456" })} retry={() => relance++} />);
    expect(screen.getByRole("heading", { name: "La page n'a pas pu s'afficher" })).toBeTruthy();
    expect(screen.getByText("123456")).toBeTruthy();
    screen.getByRole("button", { name: "Réessayer" }).click();
    expect(relance).toBe(1);
  });
});
