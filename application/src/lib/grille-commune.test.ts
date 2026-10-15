// Fichier 24 — grille commune : écarts, résumé, saisie, aperçu
import { describe, expect, it } from "vitest";
import {
  apercuChangement,
  changementsProgrammes,
  ecartsDesEntites,
  libelleActe,
  lireMontant,
  MESSAGES_GRILLE,
  resumeGrille,
  validerSaisie,
  type SaisieTarif,
} from "./grille-commune";
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
  id: `e${++k}`, entite_id: entite, type_acte_id: type, categorie, en_vigueur_depuis: depuis, motif: null,
  ...(prix === "grille" ? { suit_grille_commune: true, montant: null, devise: null } : { suit_grille_commune: false, montant: prix[0], devise: prix[1] }),
});

const ENTITES = [
  { id: "bav", code: "BAV", nom: "Chefferie des Bavira" },
  { id: "mul", code: "MUL", nom: "Commune de Mulongwe" },
  { id: "kal", code: "KAL", nom: "Commune de Kalundu" },
];
const COMMUNS = [
  commun("atres", 18000, "CDF", "2026-01-01"),
  commun("atres", 39000, "CDF", "2026-01-01", "etranger"),
  commun("veuv", 5000, "CDF", "2026-01-01"),
  commun("exnais", 30, "USD", "2026-01-01"),
  commun("ancien", 1000, "CDF", "2026-01-01"),
];
const donnees = (extra: Partial<DonneesTarifaires> = {}): DonneesTarifaires => ({
  actes: [ATRES, VEUV, EXNAIS, ANCIEN],
  communs: COMMUNS,
  ajustements: [],
  ...extra,
});

describe("Écarts des entités (en jaune dans la maquette)", () => {
  it("comme la maquette : « MUL : 20 000 FC dès le 12/11 » et « MUL : 4 000 FC depuis le 01/09 »", () => {
    const aj = [local("mul", "atres", "2026-11-12", [20000, "CDF"]), local("mul", "veuv", "2026-09-01", [4000, "CDF"])];
    expect(ecartsDesEntites(ATRES, ENTITES, aj, AUJOURDHUI).map((e) => n(e.texte))).toEqual(["MUL : 20 000 FC dès le 12/11"]);
    expect(ecartsDesEntites(VEUV, ENTITES, aj, AUJOURDHUI)).toEqual([
      { entite: "MUL", categorie: "national", aVenir: false, texte: expect.stringMatching(/^MUL : 4.000 FC depuis le 01\/09$/) },
    ]);
  });

  it("entités dans l'ordre officiel, tarif Étrangers signalé, retour à la grille annoncé, année affichée si différente", () => {
    const aj = [
      local("bav", "atres", "2026-06-01", [35000, "CDF"], "etranger"),
      local("mul", "atres", "2026-03-01", [17000, "CDF"]),
      local("mul", "atres", "2027-01-15", "grille"),
    ];
    expect(ecartsDesEntites(ATRES, ENTITES, aj, AUJOURDHUI).map((e) => n(e.texte))).toEqual([
      "MUL : 17 000 FC depuis le 01/03",
      "MUL : retour à la grille dès le 15/01/2027",
      "BAV · Étr. : 35 000 FC depuis le 01/06",
    ]);
  });

  it("un retour à la grille déjà passé : plus aucun écart", () => {
    const aj = [local("kal", "veuv", "2026-03-01", [4000, "CDF"]), local("kal", "veuv", "2026-05-01", "grille")];
    expect(ecartsDesEntites(VEUV, ENTITES, aj, AUJOURDHUI)).toEqual([]);
  });
});

describe("Résumé et changements programmés", () => {
  it("« en vigueur depuis le 01/01/2026 · 3 actes · 4 tarifs » (les actes retirés ne comptent pas)", () => {
    expect(resumeGrille(donnees(), AUJOURDHUI)).toEqual({ depuis: "2026-01-01", actes: 3, tarifs: 4, programmes: 0 });
  });

  it("changements à venir : du plus proche au plus lointain, avec le prix d'avant", () => {
    const d = donnees({
      communs: [...COMMUNS, commun("exnais", 40, "USD", "2027-06-01"), commun("exnais", 35, "USD", "2027-01-01"), commun("veuv", 6000, "CDF", "2027-01-01")],
    });
    expect(resumeGrille(d, AUJOURDHUI)).toMatchObject({ depuis: "2026-01-01", programmes: 3 });
    expect(changementsProgrammes(d, AUJOURDHUI).map((c) => [c.ligne.en_vigueur_depuis, c.acte.code, c.ligne.montant, c.avant?.montant])).toEqual([
      ["2027-01-01", "ATVEUV", 6000, 5000],
      ["2027-01-01", "EXNAIS", 35, 30],
      ["2027-06-01", "EXNAIS", 40, 35],
    ]);
  });

  it("libellé de l'acte : « 05 · Libellé ATRES »", () => expect(libelleActe(ATRES)).toBe("05 · Libellé ATRES"));
});

describe("Montant tapé", () => {
  it.each([
    ["35", "USD", 35],
    ["18 000", "CDF", 18000],
    ["18 000", "CDF", 18000],
    ["0,5", "USD", 0.5],
    ["12.75", "USD", 12.75],
    ["18000,00", "CDF", 18000],
  ] as const)("« %s » %s → %s", (texte, devise, attendu) => expect(lireMontant(texte, devise)).toBe(attendu));

  it.each([
    ["", "USD", MESSAGES_GRILLE.montant],
    ["35 $", "USD", MESSAGES_GRILLE.montant],
    ["-5", "USD", MESSAGES_GRILLE.montant],
    ["0", "CDF", MESSAGES_GRILLE.montantZero],
    ["1500,5", "CDF", MESSAGES_GRILLE.centimes],
    ["1,255", "USD", MESSAGES_GRILLE.decimales],
  ] as const)("« %s » %s → refusé", (texte, devise, message) => expect(lireMontant(texte, devise)).toBe(message));

  it("un zéro de trop est signalé", () => {
    expect(n(String(lireMontant("350000", "USD")))).toContain("Montant trop élevé : 350 000 $");
    expect(lireMontant("100000", "USD")).toBe(100000);
  });
});

describe("Contrôle de la saisie", () => {
  const saisie = (s: Partial<SaisieTarif> = {}): SaisieTarif => ({
    acteId: "exnais", categorie: "national", montant: "35", devise: "USD", date: "2027-01-01", motif: "Arrêté n° 4/2026", ...s,
  });
  const actes = [ATRES, VEUV, EXNAIS, ANCIEN];
  const champ = (s: Partial<SaisieTarif>) => {
    const r = validerSaisie(saisie(s), actes, AUJOURDHUI);
    return r.ok ? "ok" : r.champ;
  };

  it("saisie correcte : valeurs nettoyées", () => {
    expect(validerSaisie(saisie({ motif: "  Arrêté   n° 4/2026 " }), actes, AUJOURDHUI)).toEqual({
      ok: true,
      valeurs: { acte: EXNAIS, categorie: "national", montant: 35, devise: "USD", date: "2027-01-01", motif: "Arrêté n° 4/2026" },
    });
  });

  it("acte inconnu ou retiré du catalogue", () => {
    expect(champ({ acteId: "inconnu" })).toBe("acte");
    expect(champ({ acteId: "ancien" })).toBe("acte");
  });

  it("catégorie Étranger : seulement pour les actes qui ont un tarif Étrangers distinct", () => {
    expect(champ({ acteId: "atres", categorie: "etranger", devise: "CDF", montant: "40 000" })).toBe("ok");
    const r = validerSaisie(saisie({ categorie: "etranger" }), actes, AUJOURDHUI);
    expect(r).toMatchObject({ ok: false, champ: "categorie", message: expect.stringContaining("n'a qu'un seul tarif") });
    expect(champ({ categorie: "touriste" })).toBe("categorie");
  });

  it("monnaie et montant", () => {
    expect(champ({ devise: "EUR" })).toBe("devise");
    expect(champ({ montant: "trente" })).toBe("montant");
  });

  it("date : au plus tôt demain, au plus tard dans 2 ans, une vraie date", () => {
    expect(champ({ date: "2026-10-15" })).toBe("ok");
    const r = validerSaisie(saisie({ date: AUJOURDHUI }), actes, AUJOURDHUI);
    expect(r).toMatchObject({ ok: false, champ: "date", message: expect.stringContaining("au plus tôt demain (le 15/10/2026)") });
    expect(champ({ date: "2026-01-01" })).toBe("date");
    expect(champ({ date: "2028-10-14" })).toBe("ok");
    expect(validerSaisie(saisie({ date: "2028-10-15" }), actes, AUJOURDHUI)).toMatchObject({ champ: "date", message: expect.stringContaining("Vérifiez l'année") });
    expect(champ({ date: "2027-02-30" })).toBe("date");
    expect(champ({ date: "" })).toBe("date");
  });

  it("texte de référence obligatoire, 300 caractères au plus", () => {
    expect(champ({ motif: " " })).toBe("motif");
    expect(champ({ motif: "x".repeat(301) })).toBe("motif");
  });
});

describe("Aperçu avant confirmation", () => {
  const valeurs = { acte: EXNAIS, categorie: "national" as const, montant: 35, devise: "USD" as const, date: "2027-01-01", motif: "Arrêté" };

  it("prix actuel, nouveau prix, entités qui gardent leur propre prix à cette date", () => {
    const d = donnees({
      ajustements: [
        local("mul", "exnais", "2026-05-01", [25, "USD"]),
        local("kal", "exnais", "2026-05-01", [28, "USD"]),
        local("kal", "exnais", "2026-12-01", "grille"), // Kalundu revient à la grille avant le 01/01/2027
      ],
    });
    expect(apercuChangement(valeurs, d, ENTITES, AUJOURDHUI)).toEqual({
      actuel: { montant: 30, devise: "USD" },
      veille: { montant: 30, devise: "USD" },
      identique: false,
      doublon: false,
      entitesAjustees: [{ code: "MUL", prix: { montant: 25, devise: "USD" } }],
    });
  });

  it("un autre changement déjà programmé avant cette date : le prix de la veille est signalé", () => {
    const d = donnees({ communs: [...COMMUNS, commun("exnais", 32, "USD", "2026-12-01")] });
    expect(apercuChangement(valeurs, d, ENTITES, AUJOURDHUI)).toMatchObject({ actuel: { montant: 30 }, veille: { montant: 32 } });
  });

  it("même prix que la veille, ou même date qu'un changement déjà programmé", () => {
    expect(apercuChangement({ ...valeurs, montant: 30 }, donnees(), ENTITES, AUJOURDHUI).identique).toBe(true);
    const d = donnees({ communs: [...COMMUNS, commun("exnais", 33, "USD", "2027-01-01")] });
    expect(apercuChangement(valeurs, d, ENTITES, AUJOURDHUI).doublon).toBe(true);
  });
});
