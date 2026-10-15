// Fichier 36 — anciens registres : contrôles de saisie, n° suivant, n° lu dans le nom du fichier, découpage d'un gros PDF
import { describe, expect, it } from "vitest";
import { analyserPages, numeroDepuisNomFichier, numeroSuivant, pagesSuivantes, validerAncien, validerLot } from "./anciens-registres";

describe("Ouvrir un lot", () => {
  it("type, année (1900 → année en cours), description nettoyée", () => {
    expect(validerLot({ typeActeId: "t", annee: " 2019 ", description: "  Registre des naissances   2019 " }, 2026)).toEqual({
      ok: true, annee: 2019, description: "Registre des naissances 2019",
    });
    expect(validerLot({ typeActeId: "", annee: "2019", description: "x" }, 2026)).toMatchObject({ ok: false, champ: "typeActeId" });
    expect(validerLot({ typeActeId: "t", annee: "2030", description: "Registre" }, 2026)).toMatchObject({ ok: false, champ: "annee", message: "Année du registre invalide (de 1900 à 2026)." });
    expect(validerLot({ typeActeId: "t", annee: "19", description: "Registre" }, 2026)).toMatchObject({ ok: false, champ: "annee" });
    expect(validerLot({ typeActeId: "t", annee: "2019", description: " " }, 2026)).toMatchObject({ ok: false, champ: "description" });
  });
});

describe("Ajouter un ancien acte", () => {
  const naissance = { annee_registre: 2019, modele_fiche: "naissance" };
  const ok = { titulaire: "Furaha Espoir", titulaire2: "", date: "2019-05-10", numero: "412" };
  it.each([
    [ok, naissance, { ok: true }],
    [{ ...ok, titulaire: " " }, naissance, { ok: false, champ: "titulaire", message: "Indiquez le nom du titulaire." }],
    [ok, { annee_registre: 2019, modele_fiche: "mariage" }, { ok: false, champ: "titulaire2", message: "Indiquez le nom de l'épouse." }],
    [{ ...ok, date: "" }, naissance, { ok: false, champ: "date" }],
    [{ ...ok, date: "2020-01-02" }, naissance, { ok: false, champ: "date", message: "La date doit être en 2019, l'année de ce registre." }],
    [{ ...ok, numero: "  " }, naissance, { ok: false, champ: "numero" }],
  ] as const)("%o", (s, lot, attendu) => expect(validerAncien(s, lot, "2026-10-14")).toMatchObject(attendu));
  it("date dans le futur refusée", () => {
    expect(validerAncien({ ...ok, date: "2026-12-01" }, { annee_registre: 2026, modele_fiche: "naissance" }, "2026-10-14")).toMatchObject({ ok: false, champ: "date" });
  });
});

describe("Aides à la saisie", () => {
  it.each([["412", "413"], ["412 bis", "413"], ["n° 9", "10"], ["", ""], [null, ""], ["sans numéro", ""]])("n° suivant de %j → %j", (n, attendu) =>
    expect(numeroSuivant(n)).toBe(attendu));

  it.each([
    ["412.pdf", "412"], ["0412.jpg", "412"], ["reg2019_412.jpg", "412"], ["registre-2019-412bis.pdf", "412 bis"], ["412 TER.png", "412 ter"],
    ["2019.pdf", ""], ["scan.pdf", ""],
  ])("n° lu dans « %s » → « %s »", (nom, attendu) => expect(numeroDepuisNomFichier(nom, 2019)).toBe(attendu));

  it("pages d'un gros PDF pour un acte", () => {
    expect(analyserPages("3", 10)).toEqual({ ok: true, pages: [2] });
    expect(analyserPages(" 3 - 4 ", 10)).toEqual({ ok: true, pages: [2, 3] });
    expect(analyserPages("3,5,3", 10)).toEqual({ ok: true, pages: [2, 4] });
    expect(analyserPages("9-12", 10)).toEqual({ ok: false, message: "Pages 9-12 : le PDF a 10 pages." });
    expect(analyserPages("4-2", 10)).toMatchObject({ ok: false });
    expect(analyserPages("trois", 10)).toMatchObject({ ok: false, message: "« trois » n'est pas compris : écrivez par exemple « 3 » ou « 3-4 »." });
    expect(analyserPages("", 10)).toMatchObject({ ok: false });
  });

  it("pages proposées pour l'acte suivant : même nombre de pages, à la suite", () => {
    expect([pagesSuivantes(null, 10), pagesSuivantes([0, 1], 10), pagesSuivantes([2], 10), pagesSuivantes([8, 9], 10), pagesSuivantes([7, 8], 10)]).toEqual([
      "1", "3-4", "4", "", "10",
    ]);
  });
});
