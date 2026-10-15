import { describe, expect, it } from "vitest";
import { espaceDuRole } from "./connexion";
import { dateDuJour, MENUS, sousTitreEspace } from "./espaces";

describe("Menus des espaces (maquettes)", () => {
  it.each(["officier", "caissier", "admin"] as const)("%s : la première entrée est l'accueil, disponible", (role) => {
    expect(MENUS[role][0]).toMatchObject({ chemin: espaceDuRole(role), disponible: true });
  });
  it("chaque entrée reste dans l'espace de son rôle", () => {
    for (const [role, entrees] of Object.entries(MENUS)) {
      for (const e of entrees) expect(e.chemin.startsWith(`/${role}`)).toBe(true);
    }
  });
  it("les libellés sont ceux des maquettes", () => {
    expect(MENUS.officier.map((e) => e.libelle)).toEqual(["Accueil", "Nouvel acte", "Scanner", "Rechercher", "Anciens registres", "Tarifs de l'entité"]);
    expect(MENUS.caissier.map((e) => e.libelle)).toEqual(["Accueil", "Encaisser", "Reçus du jour", "Taux du jour", "Tarifs", "Clôture de caisse", "Rapports", "Rechercher"]);
    expect(MENUS.admin.map((e) => e.libelle)).toEqual(["Tableau de bord", "Rapports consolidés", "Grille commune", "Catalogue des actes", "Comptes", "Journal d'audit", "Connexions", "Rechercher"]);
  });
});

describe("En-tête", () => {
  it("sous-titres", () => {
    expect(sousTitreEspace("officier", { nom: "Commune de Mulongwe" })).toBe("Commune de Mulongwe");
    expect(sousTitreEspace("caissier", { nom: "Commune de Mulongwe" })).toBe("Commune de Mulongwe · Caisse");
    expect(sousTitreEspace("admin", null)).toBe("Administration · CDJP/Bukavu");
  });
  it("date du jour en français, à l'heure de Lubumbashi", () => {
    expect(dateDuJour(new Date("2026-10-13T10:00:00Z"))).toBe("Mardi 13 octobre 2026");
    // 23 h 30 à Lagos (UTC+1) = 0 h 30 le lendemain à Lubumbashi (UTC+2)
    expect(dateDuJour(new Date("2026-10-13T22:30:00Z"))).toBe("Mercredi 14 octobre 2026");
  });
});
