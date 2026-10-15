// Fichier 21 — formulaire « Créer un compte »
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Poste } from "@/lib/creation-compte";
import type { EtatCreation } from "./actions";
import { FormulaireCreation } from "./formulaire-creation";

const creerCompte = vi.fn<(e: EtatCreation, d: FormData) => Promise<EtatCreation>>();
vi.mock("./actions", () => ({ creerCompte: (e: EtatCreation, d: FormData) => creerCompte(e, d) }));

beforeEach(() => creerCompte.mockReset());
afterEach(cleanup);

const BAV = { id: "b", code: "BAV", nom: "Chefferie des Bavira" };
const KAL = { id: "k", code: "KAL", nom: "Commune de Kalundu" };
const POSTES: Poste[] = [
  { entite: KAL, role: "officier" },
  { entite: BAV, role: "caissier" },
];
const champ = (nom: string) => screen.getByLabelText(nom) as HTMLInputElement | HTMLSelectElement;
const options = (nom: string) => [...(champ(nom) as HTMLSelectElement).options].map((o) => o.textContent);

describe("Choix du poste", () => {
  it("seuls les postes libres sont proposés ; le nom d'utilisateur est proposé d'après le poste", () => {
    render(<FormulaireCreation postes={POSTES} />);
    expect(options("Entité")).toEqual(["Commune de Kalundu", "Chefferie des Bavira"]);
    expect(options("Rôle")).toEqual(["Officier d'état civil"]);
    expect(champ("Nom d'utilisateur").value).toBe("kalundu.officier");
    fireEvent.change(champ("Entité"), { target: { value: "BAV" } });
    expect(options("Rôle")).toEqual(["Caissier"]);
    expect(champ("Nom d'utilisateur").value).toBe("bavira.caissier");
  });

  it("« Créer » sur une ligne du tableau : le formulaire s'ouvre sur ce poste", () => {
    render(<FormulaireCreation postes={POSTES} selection="BAV-caissier" />);
    expect(champ("Entité").value).toBe("BAV");
    expect(champ("Rôle").value).toBe("caissier");
  });

  it("le nom proposé peut être modifié à la main", () => {
    render(<FormulaireCreation postes={POSTES} />);
    fireEvent.change(champ("Nom d'utilisateur"), { target: { value: "kalundu.officier2" } });
    expect(champ("Nom d'utilisateur").value).toBe("kalundu.officier2");
  });

  it("aucun poste libre : explication au lieu du formulaire", () => {
    render(<FormulaireCreation postes={[]} />);
    expect(screen.getByText(/Tous les postes sont pourvus/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Créer le compte" })).toBeNull();
  });
});

describe("Création", () => {
  it("envoie le poste, le nom complet et le nom d'utilisateur", async () => {
    creerCompte.mockResolvedValue({ ok: false, message: "x" });
    render(<FormulaireCreation postes={POSTES} selection="BAV-caissier" />);
    fireEvent.change(champ("Nom complet de l'agent"), { target: { value: "Mukeba Esther" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    await waitFor(() => expect(creerCompte).toHaveBeenCalled());
    expect(Object.fromEntries(creerCompte.mock.calls[0][1])).toEqual({
      entite: "BAV", role: "caissier", nomComplet: "Mukeba Esther", nomUtilisateur: "bavira.caissier",
    });
  });

  it("réussite : le mot de passe provisoire est affiché une seule fois, puis disparaît", async () => {
    creerCompte.mockResolvedValue({
      ok: true, nomUtilisateur: "bavira.caissier", nomComplet: "Mukeba Esther", motDePasse: "7K4-PX9-QM2",
      entite: "Chefferie des Bavira", role: "caissier",
    });
    render(<FormulaireCreation postes={POSTES} selection="BAV-caissier" />);
    fireEvent.change(champ("Nom complet de l'agent"), { target: { value: "Mukeba Esther" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect((await screen.findByTestId("mot-de-passe-provisoire")).textContent).toBe("7K4-PX9-QM2");
    expect(screen.getByText("Mot de passe provisoire (affiché une seule fois)")).toBeTruthy();
    const panneau = screen.getByRole("region", { name: "Compte créé" });
    expect(within(panneau).getByText("bavira.caissier")).toBeTruthy();
    // Fiche de remise prête à imprimer (invisible à l'écran)
    const fiche = screen.getByTestId("fiche-remise");
    expect(fiche.textContent).toContain("Fiche de remise — nouveau compte");
    expect(fiche.textContent).toContain("7K4-PX9-QM2");
    expect(fiche.textContent).toContain("Caissier · Chefferie des Bavira");
    const imprimer = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(within(panneau).getByRole("button", { name: "Imprimer la fiche de remise" }));
    expect(imprimer).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "J'ai noté le mot de passe" }));
    expect(screen.queryByText("7K4-PX9-QM2")).toBeNull();
    expect(screen.queryByTestId("fiche-remise")).toBeNull();
    expect(champ("Nom complet de l'agent").value).toBe("");
  });

  it("refus : message et champ concerné signalé, la saisie est conservée", async () => {
    creerCompte.mockResolvedValue({ ok: false, message: "Ce nom d'utilisateur est déjà pris. Choisissez-en un autre.", champ: "nomUtilisateur" });
    render(<FormulaireCreation postes={POSTES} />);
    fireEvent.change(champ("Nom complet de l'agent"), { target: { value: "Espoir Furaha" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    expect((await screen.findByRole("alert")).textContent).toContain("déjà pris");
    expect(champ("Nom d'utilisateur").getAttribute("aria-invalid")).toBe("true");
    expect(champ("Nom complet de l'agent").value).toBe("Espoir Furaha");
  });
});

describe("Le formulaire suit le poste choisi dans le tableau", () => {
  it("nouvelle sélection : le formulaire suit, sans effacer le nom complet déjà tapé", () => {
    const { rerender } = render(<FormulaireCreation postes={POSTES} selection="KAL-officier" />);
    fireEvent.change(champ("Nom complet de l'agent"), { target: { value: "Mukeba Esther" } });
    rerender(<FormulaireCreation postes={POSTES} selection="BAV-caissier" />);
    expect(champ("Entité").value).toBe("BAV");
    expect(champ("Nom d'utilisateur").value).toBe("bavira.caissier");
    expect(champ("Nom complet de l'agent").value).toBe("Mukeba Esther");
  });

  it("un mot de passe provisoire affiché ne disparaît pas si la sélection change", async () => {
    creerCompte.mockResolvedValue({
      ok: true, nomUtilisateur: "kalundu.officier", nomComplet: "Furaha Nsimire", motDePasse: "4KD-9QM-P2X",
      entite: "Commune de Kalundu", role: "officier",
    });
    const { rerender } = render(<FormulaireCreation postes={POSTES} />);
    fireEvent.change(champ("Nom complet de l'agent"), { target: { value: "Furaha Nsimire" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer le compte" }));
    await screen.findByTestId("mot-de-passe-provisoire");
    rerender(<FormulaireCreation postes={[POSTES[1]]} selection="KAL-officier" />);
    expect(screen.getByTestId("mot-de-passe-provisoire").textContent).toBe("4KD-9QM-P2X");
  });
});

describe("Les postes libres changent pendant que le formulaire est ouvert", () => {
  it("tout était pourvu, un poste se libère (désactivation) : le formulaire s'y cale entièrement", () => {
    const { rerender } = render(<FormulaireCreation postes={[]} />);
    rerender(<FormulaireCreation postes={[{ entite: KAL, role: "officier" }]} />);
    expect(champ("Entité").value).toBe("KAL");
    expect(champ("Rôle").value).toBe("officier");
    expect(champ("Nom d'utilisateur").value).toBe("kalundu.officier");
  });
});
