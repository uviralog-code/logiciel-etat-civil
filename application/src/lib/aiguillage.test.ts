// Fichier 19 — règles d'aiguillage et de protection des pages
import { describe, expect, it } from "vitest";
import {
  adresseConnexion,
  DECONNEXION_COMPTE_DESACTIVE,
  destinationFinale,
  estProtege,
  pageDAccueil,
  regleAcces,
  roleDuChemin,
  type EtatAgent,
} from "./aiguillage";

const agent = (
  role: "admin" | "officier" | "caissier",
  options: Partial<{ actif: boolean; niveau: "aal1" | "aal2"; doitChanger: boolean; double: boolean }> = {},
): EtatAgent => ({
  actif: options.actif ?? true,
  niveau: options.niveau ?? "aal1",
  profil: {
    role,
    doitChangerMotDePasse: options.doitChanger ?? false,
    doubleVerification: options.double ?? role === "admin",
  },
});

describe("Pages publiques et protégées", () => {
  it.each([
    ["/connexion", false],
    ["/deconnexion", false],
    ["/photo/Zx3-abc_123", false], // page du téléphone (QR code, fichier 34)
    ["/photographie", true],
    ["/verifier/0123456789abcdef0123456789abcdef", false], // vérification d'un reçu (QR code, fichier 39)
    ["/verifications", true],
    ["/", true],
    ["/officier", true],
    ["/officier/actes/nouveau", true],
    ["/admin/comptes", true],
    ["/mot-de-passe", true],
    ["/verification", true],
    ["/connexions-piege", true],
    ["/page-inconnue", true],
  ])("« %s » protégée : %s", (chemin, attendu) => expect(estProtege(chemin)).toBe(attendu));

  it.each([
    ["/officier", "officier"],
    ["/officier/scanner", "officier"],
    ["/caissier/cloture", "caissier"],
    ["/admin", "admin"],
    ["/administration", null],
    ["/connexion", null],
    ["/", null],
  ])("« %s » appartient à : %s", (chemin, attendu) => expect(roleDuChemin(chemin)).toBe(attendu));
});

describe("Entrée dans un espace de travail", () => {
  it("personne connecté → connexion", () => {
    expect(regleAcces(null, "officier")).toEqual({ autorise: false, redirection: "/connexion" });
  });
  it("compte désactivé alors que la session est ouverte → session fermée, avec explication", () => {
    expect(DECONNEXION_COMPTE_DESACTIVE).toBe("/deconnexion?motif=desactive");
    expect(regleAcces(agent("officier", { actif: false }), "officier")).toEqual({ autorise: false, redirection: DECONNEXION_COMPTE_DESACTIVE });
  });
  it("mot de passe provisoire → d'abord le remplacer (même pour l'admin vérifié)", () => {
    expect(regleAcces(agent("caissier", { doitChanger: true }), "caissier")).toEqual({ autorise: false, redirection: "/mot-de-passe" });
    expect(regleAcces(agent("admin", { doitChanger: true, niveau: "aal2" }), "admin")).toEqual({ autorise: false, redirection: "/mot-de-passe" });
  });
  it("administrateur sans code validé → code de vérification", () => {
    expect(regleAcces(agent("admin", { niveau: "aal1" }), "admin")).toEqual({ autorise: false, redirection: "/verification" });
  });
  it("administrateur avec code validé → entre dans son espace", () => {
    expect(regleAcces(agent("admin", { niveau: "aal2" }), "admin")).toEqual({ autorise: true });
  });
  it("officier et caissier entrent dans LEUR espace avec le mot de passe seul", () => {
    expect(regleAcces(agent("officier"), "officier")).toEqual({ autorise: true });
    expect(regleAcces(agent("caissier"), "caissier")).toEqual({ autorise: true });
  });
  it.each([
    ["officier", "caissier", "/officier"],
    ["officier", "admin", "/officier"],
    ["caissier", "officier", "/caissier"],
    ["caissier", "admin", "/caissier"],
  ] as const)("%s qui tente l'espace %s → renvoyé vers %s", (role, espace, attendu) => {
    expect(regleAcces(agent(role), espace)).toEqual({ autorise: false, redirection: attendu });
  });
  it("l'administrateur vérifié qui ouvre un espace d'agent → renvoyé vers le sien", () => {
    expect(regleAcces(agent("admin", { niveau: "aal2" }), "officier")).toEqual({ autorise: false, redirection: "/admin" });
  });
  it("l'administrateur NON vérifié qui ouvre un espace d'agent → d'abord le code", () => {
    expect(regleAcces(agent("admin", { niveau: "aal1" }), "officier")).toEqual({ autorise: false, redirection: "/verification" });
  });
});

describe("Adresse principale « / »", () => {
  it.each([
    [null, "/connexion"],
    [agent("officier"), "/officier"],
    [agent("caissier"), "/caissier"],
    [agent("admin", { niveau: "aal1" }), "/verification"],
    [agent("admin", { niveau: "aal2" }), "/admin"],
    [agent("officier", { doitChanger: true }), "/mot-de-passe"],
    [agent("caissier", { actif: false }), "/deconnexion?motif=desactive"],
  ])("%o → %s", (etat, attendu) => expect(pageDAccueil(etat)).toBe(attendu));
});

describe("Retour à la page demandée après la connexion", () => {
  it.each([
    ["/officier", "/officier/actes/nouveau", "/officier/actes/nouveau"],
    ["/officier", "/officier?onglet=jour", "/officier?onglet=jour"],
    ["/caissier", "/caissier/cloture", "/caissier/cloture"],
    ["/officier", null, "/officier"],
    // Autre espace : refusé
    ["/officier", "/caissier/cloture", "/officier"],
    ["/officier", "/admin/comptes", "/officier"],
    ["/officier", "/officiers-pirate", "/officier"],
    // Autres sites : refusés
    ["/officier", "//pirate.example/officier", "/officier"],
    ["/officier", "https://pirate.example/officier", "/officier"],
    ["/officier", "/\\pirate.example", "/officier"],
    // Parcours obligatoire d'abord (mot de passe, code) : la page demandée est ignorée
    ["/mot-de-passe", "/officier/scanner", "/mot-de-passe"],
    ["/verification", "/admin/comptes", "/verification"],
  ])("destination %s, page demandée %s → %s", (destination, suite, attendu) => {
    expect(destinationFinale(destination, suite)).toBe(attendu);
  });

  it.each([
    ["/officier/scanner", "", "/connexion?suite=%2Fofficier%2Fscanner"],
    ["/caissier", "?jour=2026-10-14", "/connexion?suite=%2Fcaissier%3Fjour%3D2026-10-14"],
    ["/", "", "/connexion"],
    ["/connexion", "", "/connexion"],
  ])("sans session, « %s%s » → %s", (chemin, recherche, attendu) => {
    expect(adresseConnexion(chemin, recherche)).toBe(attendu);
  });
});
