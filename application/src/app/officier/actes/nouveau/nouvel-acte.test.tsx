// Fichier 29 — écrans « Nouvel acte » : choix du type, fiche, transmission
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EtapesSaisie } from "@/components/etapes-saisie";
import type { ResultatActe, SaisieActe, TypeActePourSaisie } from "@/lib/actes";
import type { GroupeFamille } from "@/lib/nouvel-acte";
import { BoutonTransmettre } from "../[id]/enregistre/bouton-transmettre";
import { FormulaireActe } from "./[code]/formulaire-acte";
import { ChoixType } from "./choix-type";

const enregistrer = vi.fn<(s: SaisieActe, transmettre: boolean) => Promise<ResultatActe>>();
const corriger = vi.fn<(id: string, s: SaisieActe, transmettre: boolean) => Promise<ResultatActe>>();
const transmettre = vi.fn<(id: string) => Promise<ResultatActe>>();
vi.mock("../actions", () => ({
  enregistrer: (s: SaisieActe, t: boolean) => enregistrer(s, t),
  corriger: (id: string, s: SaisieActe, t: boolean) => corriger(id, s, t),
  transmettre: (id: string) => transmettre(id),
}));
beforeEach(() => {
  enregistrer.mockReset();
  corriger.mockReset();
  transmettre.mockReset();
});
afterEach(cleanup);

const n = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const AUJOURDHUI = "2026-10-14";
const acte = (id: string, numero: number, code: string, libelle: string, famille: "extrait" | "attestation") => ({
  id, numero, code, libelle, famille, tarif_distinct_etranger: false, couleur: "#2E7D32", actif: true,
});
const GROUPES: GroupeFamille[] = [
  { famille: "extrait", nom: "Extraits", couleur: "#374151", cartes: [{ acte: acte("exnais", 22, "EXNAIS", "Extrait d'acte de naissance", "extrait"), prix: "30 $", disponibleLe: null }] },
  {
    famille: "attestation", nom: "Attestations", couleur: "#1565C0",
    cartes: [
      { acte: acte("atcel", 8, "ATCEL", "Attestation de célibat", "attestation"), prix: "National 9 000 FC · Étranger 30 000 FC", disponibleLe: null },
      { acte: acte("neuf", 27, "ATSEP", "Attestation de séparation", "attestation"), prix: "—", disponibleLe: "2026-10-15" },
    ],
  },
];

describe("Étape 1 : choix du type (maquette)", () => {
  it("cartes par famille, avec code, numéro, nom et prix ; lien vers la fiche", () => {
    render(<ChoixType groupes={GROUPES} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Quel acte voulez-vous établir ?");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Extraits", "Attestations"]);
    const exnais = screen.getByRole("link", { name: /EXNAIS/ });
    expect(n(exnais.textContent)).toBe("EXNAISN° 22Extrait d'acte de naissance30 $");
    expect(exnais.getAttribute("href")).toBe("/officier/actes/nouveau/EXNAIS");
  });

  it("un acte pas encore disponible n'est pas cliquable", () => {
    render(<ChoixType groupes={GROUPES} />);
    expect(screen.queryByRole("link", { name: /ATSEP/ })).toBeNull();
    expect(n(screen.getByText("Disponible le 15/10/2026").closest("[aria-disabled]")?.textContent)).toContain("ATSEP");
  });

  it("filtre : seules les cartes qui correspondent restent ; rien : un message", () => {
    render(<ChoixType groupes={GROUPES} />);
    fireEvent.change(screen.getByLabelText("Filtrer"), { target: { value: "célibat" } });
    expect(screen.getAllByRole("listitem").map((l) => l.getAttribute("data-type"))).toEqual(["ATCEL"]);
    fireEvent.change(screen.getByLabelText("Filtrer"), { target: { value: "passeport" } });
    expect(screen.getByRole("status").textContent).toBe("Aucun acte ne correspond à « passeport ».");
  });
});

describe("Étapes de la saisie", () => {
  it("étape courante signalée ; les précédentes cochées", () => {
    render(<EtapesSaisie courante={2} />);
    const etapes = screen.getAllByRole("listitem");
    expect(etapes.map((e) => n(e.textContent))).toEqual(["Type d'acte (fait)", "›2Fiche", "›3Transmission au Caissier"]);
    expect(etapes[1].getAttribute("aria-current")).toBe("step");
  });
});

describe("Étape 2 : la fiche", () => {
  const EXNAIS: TypeActePourSaisie = { id: "exnais", code: "EXNAIS", libelle: "Extrait d'acte de naissance", modele_fiche: "naissance", tarif_distinct_etranger: false, actif: true };
  const ATCEL: TypeActePourSaisie = { id: "atcel", code: "ATCEL", libelle: "Attestation de célibat", modele_fiche: "generique", tarif_distinct_etranger: true, actif: true };
  const MAR: TypeActePourSaisie = { id: "mar", code: "MAR", libelle: "Célébration de mariage", modele_fiche: "mariage", tarif_distinct_etranger: false, actif: true };
  const afficher = (type: TypeActePourSaisie, prix = { national: { montant: 30, devise: "USD" as const }, etranger: { montant: 30, devise: "USD" as const } }) =>
    render(<FormulaireActe type={type} prix={prix} taux={2850} idPrevu="MUL-EXNAIS-2026-000125" aujourdhui={AUJOURDHUI} />);
  const taper = (label: string, valeur: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: valeur } });

  it("fiche de naissance et récapitulatif comme la maquette", () => {
    afficher(EXNAIS);
    expect(screen.getByRole("heading", { name: "L'enfant (titulaire de l'acte)" })).toBeTruthy();
    for (const l of ["Nom complet (nom, postnom, prénom)", "Masculin", "Féminin", "Date de naissance", "Lieu de naissance", "Nom du père", "Nom de la mère", "Nom du demandeur", "Téléphone", "Congolaise (national)", "Étrangère", "Observations (facultatif)"]) {
      expect(screen.getByLabelText(l)).toBeTruthy();
    }
    expect(n(screen.getByTestId("montant").textContent)).toBe("Montant à payer (grille en vigueur)30 $soit 85 500 FC au taux du jour (2 850 FC pour 1 $)");
    expect(screen.getByTestId("id-prevu").textContent).toBe("MUL-EXNAIS-2026-000125");
    expect(screen.getByText("Pour cet acte, le tarif est le même pour tous.")).toBeTruthy();
    expect((screen.getByLabelText("Date de naissance") as HTMLInputElement).max).toBe(AUJOURDHUI);
  });

  it("mariage : les deux époux", () => {
    afficher(MAR);
    expect(screen.getByLabelText("Nom complet de l'époux")).toBeTruthy();
    expect(screen.getByLabelText("Nom complet de l'épouse")).toBeTruthy();
    expect(screen.getByLabelText("Date de célébration")).toBeTruthy();
  });

  it("tarif Étrangers distinct : le prix suit la nationalité choisie", () => {
    afficher(ATCEL, { national: { montant: 9000, devise: "CDF" }, etranger: { montant: 30000, devise: "CDF" } } as never);
    expect(n(screen.getByTestId("montant").textContent)).toContain("9 000 FC");
    fireEvent.click(screen.getByLabelText("Étrangère"));
    expect(n(screen.getByTestId("montant").textContent)).toContain("30 000 FC");
    expect(screen.getByText("Pour cet acte, les étrangers paient un tarif différent.")).toBeTruthy();
  });

  it("saisie incomplète : message, champ signalé et mis en avant, rien n'est envoyé", () => {
    afficher(EXNAIS);
    taper("Nom complet (nom, postnom, prénom)", "MUGISHO Bahati Jean");
    fireEvent.click(screen.getByLabelText("Masculin"));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et transmettre au Caissier" }));
    expect(screen.getByRole("alert").textContent).toBe("Date de naissance : à remplir.");
    expect(screen.getByLabelText("Date de naissance").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Date de naissance"));
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it("« Enregistrer et transmettre » : la saisie part au serveur ; un refus de la base s'affiche", async () => {
    enregistrer.mockResolvedValue({ ok: false, message: "Aucun tarif n'est défini pour cet acte à cette date : impossible de l'enregistrer." });
    afficher(EXNAIS);
    taper("Nom complet (nom, postnom, prénom)", "MUGISHO Bahati Jean");
    fireEvent.click(screen.getByLabelText("Masculin"));
    taper("Date de naissance", "2015-03-21");
    taper("Lieu de naissance", "Uvira");
    taper("Nom du demandeur", "Mugisho Pierre");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et transmettre au Caissier" }));
    await waitFor(() => expect(enregistrer).toHaveBeenCalled());
    expect(enregistrer.mock.calls[0]).toEqual([
      {
        typeActeId: "exnais", categorie: "national", titulaire: "MUGISHO Bahati Jean", titulaire2: "", demandeur: "Mugisho Pierre", telephone: "",
        observations: "", details: { sexe: "M", date_naissance: "2015-03-21", lieu_naissance: "Uvira" },
      },
      true,
    ]);
    expect((await screen.findByRole("alert")).textContent).toContain("Aucun tarif");
  });

  it("« Enregistrer sans transmettre »", async () => {
    enregistrer.mockResolvedValue({ ok: false, message: "x" });
    afficher(ATCEL, { national: { montant: 9000, devise: "CDF" }, etranger: { montant: 30000, devise: "CDF" } } as never);
    taper("Nom complet (nom, postnom, prénom)", "Furaha Neema");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer sans transmettre" }));
    await waitFor(() => expect(enregistrer).toHaveBeenCalled());
    expect(enregistrer.mock.calls[0][1]).toBe(false);
  });

  it("deux fiches dans la page (Next garde l'ancienne, cachée) : aucun identifiant en double", () => {
    const { container } = render(
      <>
        <FormulaireActe type={EXNAIS} prix={{ national: { montant: 30, devise: "USD" }, etranger: null }} taux={2850} idPrevu="A" aujourdhui={AUJOURDHUI} />
        <FormulaireActe type={EXNAIS} prix={{ national: { montant: 30, devise: "USD" }, etranger: null }} taux={2850} idPrevu="B" aujourdhui={AUJOURDHUI} />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const [, second] = screen.getAllByLabelText("Nom complet (nom, postnom, prénom)");
    fireEvent.change(second, { target: { value: "Seconde fiche" } });
    expect((screen.getAllByLabelText("Nom complet (nom, postnom, prénom)")[0] as HTMLInputElement).value).toBe("");
  });

  it("« Abandonner cette saisie » ramène à l'accueil", () => {
    afficher(EXNAIS);
    expect(screen.getByRole("link", { name: "Abandonner cette saisie" }).getAttribute("href")).toBe("/officier");
  });
});

describe("Correction d'un acte renvoyé (fichier 30)", () => {
  const EXNAIS: TypeActePourSaisie = { id: "exnais", code: "EXNAIS", libelle: "Extrait d'acte de naissance", modele_fiche: "naissance", tarif_distinct_etranger: false, actif: true };
  const initial: SaisieActe = {
    typeActeId: "exnais", categorie: "national", titulaire: "Furaha Neema", titulaire2: "", demandeur: "Mugisho Pierre", telephone: "", observations: "",
    details: { sexe: "F", date_naissance: "2015-03-21", lieu_naissance: "Uvira" },
  };
  const afficher = () =>
    render(
      <FormulaireActe
        type={EXNAIS}
        prix={{ national: { montant: 30, devise: "USD" }, etranger: null }}
        taux={2850}
        idPrevu="MUL-EXNAIS-2026-000017"
        aujourdhui={AUJOURDHUI}
        correction={{ acteId: "a17", initial }}
      />,
    );

  it("la fiche est pré-remplie ; l'ID est celui de l'acte ; boutons de correction", () => {
    afficher();
    expect((screen.getByLabelText("Nom complet (nom, postnom, prénom)") as HTMLInputElement).value).toBe("Furaha Neema");
    expect((screen.getByLabelText("Féminin") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Date de naissance") as HTMLInputElement).value).toBe("2015-03-21");
    expect(n(screen.getByText("ID de l'acte (il ne change pas)").parentElement?.textContent)).toContain("MUL-EXNAIS-2026-000017");
    expect(screen.getByRole("button", { name: "Corriger et transmettre au Caissier" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Corriger sans transmettre" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abandonner la correction" })).toBeTruthy();
  });

  it("« Corriger et transmettre » : la correction part au serveur, pas un nouvel acte", async () => {
    corriger.mockResolvedValue({ ok: false, message: "x" });
    afficher();
    fireEvent.change(screen.getByLabelText("Nom complet (nom, postnom, prénom)"), { target: { value: "NEEMA Furaha" } });
    fireEvent.click(screen.getByRole("button", { name: "Corriger et transmettre au Caissier" }));
    await waitFor(() => expect(corriger).toHaveBeenCalled());
    expect(corriger.mock.calls[0]).toEqual(["a17", { ...initial, titulaire: "NEEMA Furaha" }, true]);
    expect(enregistrer).not.toHaveBeenCalled();
  });
});

describe("Étape 3 : transmettre un acte resté « enregistré »", () => {
  it("bouton : appelle le serveur ; un refus s'affiche", async () => {
    transmettre.mockResolvedValue({ ok: false, message: "Cet acte n'est plus « enregistré »." });
    render(<BoutonTransmettre id="a1" />);
    fireEvent.click(screen.getByRole("button", { name: "Transmettre au Caissier" }));
    await waitFor(() => expect(transmettre).toHaveBeenCalledWith("a1"));
    expect(within(document.body).getByRole("alert").textContent).toContain("n'est plus");
  });
});
