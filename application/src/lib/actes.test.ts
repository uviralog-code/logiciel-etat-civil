// Fichier 28 — actes : fiches et contrôle de la saisie
import { describe, expect, it } from "vitest";
import { FICHES, MESSAGES_ACTE, nettoyerNom, saisieDepuisActe, validerSaisieActe, type ActeComplet, type SaisieActe, type TypeActePourSaisie } from "./actes";

const AUJOURDHUI = "2026-10-14";
const type = (code: string, modele: TypeActePourSaisie["modele_fiche"], o: Partial<TypeActePourSaisie> = {}): TypeActePourSaisie => ({
  id: `00000000-0000-0000-0000-0000000000${code.length}${modele.length}`, code, libelle: code, modele_fiche: modele, tarif_distinct_etranger: false, actif: true, ...o,
});
const EXNAIS = type("EXNAIS", "naissance");
const MAR = type("MAR", "mariage");
const DEC = type("DEC", "deces");
const ATRES = type("ATRES", "generique", { tarif_distinct_etranger: true });

const saisie = (t: TypeActePourSaisie, s: Partial<SaisieActe> = {}): SaisieActe => ({
  typeActeId: t.id, categorie: "national", titulaire: "MUGISHO Bahati Jean", titulaire2: "", demandeur: "", telephone: "", observations: "", details: {}, ...s,
});
const champ = (t: TypeActePourSaisie, s: Partial<SaisieActe>) => {
  const r = validerSaisieActe(saisie(t, s), t, AUJOURDHUI);
  return r.ok ? "ok" : r.champ;
};

describe("Les fiches (maquette « Nouvel acte — Fiche »)", () => {
  it("naissance : l'enfant, son sexe, sa date et son lieu de naissance, ses parents", () => {
    expect(FICHES.naissance.titreTitulaire).toBe("L'enfant (titulaire de l'acte)");
    expect(FICHES.naissance.champs.map((c) => c.libelle)).toEqual(["Sexe", "Date de naissance", "Lieu de naissance", "Nom du père", "Nom de la mère"]);
  });
  it("mariage : deux époux ; décès : le défunt ; fiche simple : rien de plus", () => {
    expect(FICHES.mariage.libelleTitulaire2).toBe("Nom complet de l'épouse");
    expect(FICHES.deces.champs.filter((c) => c.obligatoire).map((c) => c.cle)).toEqual(["date_deces"]);
    expect(FICHES.generique.champs).toEqual([]);
  });
});

describe("Contrôle de la saisie", () => {
  it("naissance correcte : noms nettoyés, détails typés, champs vides omis", () => {
    expect(
      validerSaisieActe(
        saisie(EXNAIS, {
          titulaire: "  MUGISHO   Bahati Jean ", demandeur: " Mugisho Pierre ", telephone: "+243 990 000 000",
          details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: " Uvira ", nom_pere: "", nom_mere: "Bahati Claire" },
        }),
        EXNAIS,
        AUJOURDHUI,
      ),
    ).toEqual({
      ok: true,
      valeurs: {
        type: EXNAIS, categorie: "national", titulaire: "MUGISHO Bahati Jean", titulaire2: null, demandeur: "Mugisho Pierre",
        telephone: "+243 990 000 000", observations: null,
        details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: "Uvira", nom_mere: "Bahati Claire" },
      },
    });
  });

  it("type : choisi d'abord, et encore au catalogue", () => {
    expect(validerSaisieActe(saisie(EXNAIS), undefined, AUJOURDHUI)).toMatchObject({ ok: false, champ: "type", message: MESSAGES_ACTE.type });
    expect(validerSaisieActe(saisie(EXNAIS), { ...EXNAIS, actif: false }, AUJOURDHUI)).toMatchObject({ ok: false, message: MESSAGES_ACTE.typeRetire });
  });

  it("titulaire obligatoire ; demandeur facultatif mais complet s'il est donné", () => {
    expect(champ(ATRES, { titulaire: "  " })).toBe("titulaire");
    expect(champ(ATRES, { titulaire: "Jo" })).toBe("titulaire");
    expect(champ(ATRES, { titulaire: "x".repeat(151) })).toBe("titulaire");
    expect(champ(ATRES, { demandeur: "Al" })).toBe("demandeur");
    expect(champ(ATRES, {})).toBe("ok");
  });

  it("naissance : sexe et date obligatoires, date ni future ni invraisemblable", () => {
    expect(champ(EXNAIS, { details: { date_naissance: "2015-03-21" } })).toBe("sexe");
    expect(champ(EXNAIS, { details: { sexe: "X", date_naissance: "2015-03-21" } })).toBe("sexe");
    expect(champ(EXNAIS, { details: { sexe: "F" } })).toBe("date_naissance");
    expect(champ(EXNAIS, { details: { sexe: "F", date_naissance: "2026-10-15" } })).toBe("date_naissance");
    expect(champ(EXNAIS, { details: { sexe: "F", date_naissance: "1850-01-01" } })).toBe("date_naissance");
    expect(champ(EXNAIS, { details: { sexe: "F", date_naissance: "2026-02-30" } })).toBe("date_naissance");
    expect(champ(EXNAIS, { details: { sexe: "F", date_naissance: AUJOURDHUI } })).toBe("ok");
  });

  it("mariage : les deux époux et la date de célébration", () => {
    expect(champ(MAR, { details: { date_celebration: "2026-10-10" } })).toBe("titulaire2");
    expect(champ(MAR, { titulaire2: "Mapendo Grace" })).toBe("date_celebration");
    expect(champ(MAR, { titulaire2: "Mapendo Grace", details: { date_celebration: "2026-10-10" } })).toBe("ok");
  });

  it("décès : date obligatoire, âge entier entre 0 et 130", () => {
    expect(champ(DEC, {})).toBe("date_deces");
    expect(champ(DEC, { details: { date_deces: "2026-10-12", age_au_deces: "67,5" } })).toBe("age_au_deces");
    expect(champ(DEC, { details: { date_deces: "2026-10-12", age_au_deces: "200" } })).toBe("age_au_deces");
    expect(validerSaisieActe(saisie(DEC, { details: { date_deces: "2026-10-12", age_au_deces: "67" } }), DEC, AUJOURDHUI)).toMatchObject({
      ok: true, valeurs: { details: { date_deces: "2026-10-12", age_au_deces: 67 } },
    });
  });

  it("une fiche simple ignore les informations d'une autre fiche", () => {
    expect(validerSaisieActe(saisie(ATRES, { details: { sexe: "M" } }), ATRES, AUJOURDHUI)).toMatchObject({ ok: true, valeurs: { details: {} } });
  });

  it("téléphone, nationalité, observations", () => {
    expect(champ(ATRES, { telephone: "abc" })).toBe("telephone");
    expect(champ(ATRES, { telephone: "0990000000" })).toBe("ok");
    expect(champ(ATRES, { categorie: "autre" })).toBe("categorie");
    expect(champ(ATRES, { categorie: "etranger" })).toBe("ok");
    expect(champ(ATRES, { observations: "x".repeat(501) })).toBe("observations");
  });

  it("nettoyage des noms", () => expect(nettoyerNom("  NEEMA \n Furaha  ")).toBe("NEEMA Furaha"));
});

it("correction : le formulaire est pré-rempli à partir de l'acte", () => {
  const acte = {
    type_acte_id: EXNAIS.id, categorie: "national", titulaire_nom: "MUGISHO Bahati Jean", titulaire_2_nom: null, demandeur_nom: "Mugisho Pierre",
    demandeur_telephone: null, observations: null, details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: null, nom_pere: null, nom_mere: "Bahati Claire" },
  } as unknown as ActeComplet;
  expect(saisieDepuisActe(acte)).toEqual({
    typeActeId: EXNAIS.id, categorie: "national", titulaire: "MUGISHO Bahati Jean", titulaire2: "", demandeur: "Mugisho Pierre", telephone: "",
    observations: "", details: { sexe: "M", date_naissance: "2015-03-21", nom_mere: "Bahati Claire" },
  });
});
