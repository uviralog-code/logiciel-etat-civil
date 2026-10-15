// Fichier 20 — règles d'affichage de la liste des comptes
import { describe, expect, it } from "vitest";
import { etatCompte, formaterDerniereConnexion, nomCourt, organiserComptes, type Entite, type LigneCompte } from "./comptes";

// Mercredi 14 octobre 2026, 10 h 00 à Lubumbashi (UTC+2)
const MAINTENANT = new Date("2026-10-14T08:00:00Z");
const ilYa = (jours: number, heures = 0) => new Date(MAINTENANT.getTime() - (jours * 24 + heures) * 3600_000).toISOString();

const ENTITES: Entite[] = [
  { id: "e-bav", code: "BAV", nom: "Chefferie des Bavira" },
  { id: "e-kal", code: "KAL", nom: "Commune de Kalundu" },
  { id: "e-mul", code: "MUL", nom: "Commune de Mulongwe" },
  { id: "e-kav", code: "KAV", nom: "Commune de Kavimvira" },
];
const entite = (code: string) => {
  const e = ENTITES.find((x) => x.code === code)!;
  return { code: e.code, nom: e.nom };
};
let n = 0;
function compte(role: "officier" | "caissier" | "admin", code: string | null, options: Partial<LigneCompte> = {}): LigneCompte {
  n++;
  return {
    id: `u-${n}`, nom_utilisateur: `agent.${n}`, nom_complet: `Agent ${n}`, role, actif: true,
    doit_changer_mot_de_passe: false, derniere_connexion_en_ligne: ilYa(0, 1), desactive_le: null,
    entite: code ? entite(code) : null, ...options,
  };
}

describe("Nom court des entités", () => {
  it.each([
    ["Commune de Mulongwe", "Mulongwe"],
    ["Commune de Kavimvira", "Kavimvira"],
    ["Chefferie des Bavira", "Bavira"],
  ])("%s → %s", (nom, attendu) => expect(nomCourt(nom)).toBe(attendu));
});

describe("Dernière connexion en ligne", () => {
  it("aujourd'hui, à l'heure de Lubumbashi", () => {
    expect(formaterDerniereConnexion("2026-10-14T05:52:00Z", MAINTENANT)).toBe("aujourd'hui 07 h 52");
  });
  it("hier", () => {
    expect(formaterDerniereConnexion("2026-10-13T14:20:00Z", MAINTENANT)).toBe("hier 16 h 20");
  });
  it("le changement de jour suit l'heure de Lubumbashi (23 h 30 à Lagos = 0 h 30 le lendemain)", () => {
    expect(formaterDerniereConnexion("2026-10-13T22:30:00Z", MAINTENANT)).toBe("aujourd'hui 00 h 30");
  });
  it("il y a quelques jours", () => {
    expect(formaterDerniereConnexion(ilYa(6), MAINTENANT)).toBe("il y a 6 jours");
  });
  it("plus ancien : la date", () => {
    expect(formaterDerniereConnexion("2026-10-02T09:00:00Z", MAINTENANT)).toBe("02/10/2026");
  });
  it("jamais : un tiret", () => {
    expect(formaterDerniereConnexion(null, MAINTENANT)).toBe("—");
  });
});

describe("État d'un compte", () => {
  it("connecté récemment : Actif", () => {
    expect(etatCompte(compte("officier", "MUL"), MAINTENANT)).toEqual({ libelle: "Actif", ton: "ok" });
  });
  it("6 jours sans connexion en ligne : il reste 1 jour de travail hors-ligne (comme sur la maquette)", () => {
    expect(etatCompte(compte("officier", "KAL", { derniere_connexion_en_ligne: ilYa(6) }), MAINTENANT)).toEqual({
      libelle: "Hors-ligne : reste 1 jour", ton: "attention",
    });
  });
  it("5 jours : il reste 2 jours", () => {
    expect(etatCompte(compte("officier", "KAL", { derniere_connexion_en_ligne: ilYa(5) }), MAINTENANT).libelle).toBe("Hors-ligne : reste 2 jours");
  });
  it("4 jours : pas encore d'alerte", () => {
    expect(etatCompte(compte("officier", "KAL", { derniere_connexion_en_ligne: ilYa(4) }), MAINTENANT).ton).toBe("ok");
  });
  it("7 jours ou plus : travail hors-ligne bloqué", () => {
    expect(etatCompte(compte("caissier", "KAL", { derniere_connexion_en_ligne: ilYa(7) }), MAINTENANT)).toEqual({ libelle: "Hors-ligne bloqué", ton: "bloque" });
  });
  it("compte créé, jamais utilisé : première connexion attendue", () => {
    expect(etatCompte(compte("caissier", "BAV", { derniere_connexion_en_ligne: null, doit_changer_mot_de_passe: true }), MAINTENANT)).toEqual({
      libelle: "Première connexion attendue", ton: "attention",
    });
  });
  it("mot de passe réinitialisé, pas encore remplacé", () => {
    expect(etatCompte(compte("caissier", "BAV", { doit_changer_mot_de_passe: true }), MAINTENANT)).toEqual({
      libelle: "Mot de passe provisoire", ton: "attention",
    });
  });
  it("désactivé : la date de désactivation", () => {
    expect(etatCompte(compte("caissier", "BAV", { actif: false, desactive_le: "2026-10-05T10:00:00Z" }), MAINTENANT)).toEqual({
      libelle: "Désactivé le 05/10", ton: "eteint",
    });
  });
});

describe("Organisation de la liste", () => {
  const comptes = [
    compte("caissier", "BAV", { actif: false, desactive_le: "2026-10-05T10:00:00Z", nom_utilisateur: "bavira.caissier.ancien20261005" }),
    compte("officier", "BAV", { nom_utilisateur: "bavira.officier" }),
    compte("caissier", "MUL", { nom_utilisateur: "mulongwe.caissier" }),
    compte("officier", "MUL", { nom_utilisateur: "mulongwe.officier" }),
    compte("officier", "KAV", { nom_utilisateur: "kavimvira.officier" }),
    compte("caissier", "KAV", { nom_utilisateur: "kavimvira.caissier", derniere_connexion_en_ligne: ilYa(8) }),
    compte("officier", "KAL", { nom_utilisateur: "kalundu.officier", derniere_connexion_en_ligne: ilYa(6) }),
    compte("caissier", "KAL", { nom_utilisateur: "kalundu.caissier" }),
    compte("admin", null, { nom_utilisateur: "cdjp.admin" }),
  ];
  const { rangees, totaux } = organiserComptes(comptes, ENTITES, MAINTENANT);
  const vue = rangees.map((r) => (r.type === "compte" ? r.compte.nom_utilisateur : `À créer : ${r.role} ${r.entite.code}`));

  it("Mulongwe, Kavimvira, Kalundu, Bavira ; officier puis caissier ; poste vide à créer ; ancien compte à la fin de son entité", () => {
    expect(vue).toEqual([
      "mulongwe.officier", "mulongwe.caissier",
      "kavimvira.officier", "kavimvira.caissier",
      "kalundu.officier", "kalundu.caissier",
      "bavira.officier", "À créer : caissier BAV", "bavira.caissier.ancien20261005",
    ]);
  });
  it("l'administrateur n'apparaît pas dans la liste des agents", () => {
    expect(vue).not.toContain("cdjp.admin");
  });
  it("totaux : comptes actifs, postes à pourvoir, comptes désactivés, comptes à surveiller", () => {
    expect(totaux).toEqual({ actifs: 7, aCreer: 1, desactives: 1, alertes: 2 });
  });
  it("aucun compte : 8 postes à créer", () => {
    expect(organiserComptes([], ENTITES, MAINTENANT).totaux).toEqual({ actifs: 0, aCreer: 8, desactives: 0, alertes: 0 });
  });
});
