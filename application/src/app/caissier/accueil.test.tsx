// Fichier 37 — accueil du caissier : fenêtre « Renvoyer à l'Officier », annonces, remise à jour automatique
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatRenvoi } from "@/lib/accueil-caissier";
import { Actualisation, Annonces } from "./actualisation";
import { BoutonRenvoyer } from "./bouton-renvoyer";
import { FileAEncaisser, type LigneFile } from "./file-a-encaisser";

const renvoyer = vi.fn<(id: string, motif: string, precision: string) => Promise<ResultatRenvoi>>();
vi.mock("./actions", () => ({
  renvoyer: (i: string, m: string, p: string) => renvoyer(i, m, p),
}));
const rafraichir = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: rafraichir }),
}));
beforeEach(() => {
  renvoyer.mockReset();
  rafraichir.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const acte = {
  id: "00000000-0000-0000-0000-0000000000a1",
  identifiant: "MUL-EXNAIS-2026-000124",
  titulaire: "Mapendo Grace",
};
const ouvrir = () => {
  render(
    <>
      <Annonces />
      <BoutonRenvoyer acte={acte} />
    </>,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Renvoyer MUL-EXNAIS-2026-000124 à l'Officier",
    }),
  );
  return screen.getByRole("dialog", { name: "Renvoyer à l'Officier" });
};

describe("Renvoyer à l'Officier", () => {
  it("motif courant + précision : envoyé ; fenêtre fermée ; réussite annoncée", async () => {
    renvoyer.mockResolvedValue({ ok: true, identifiant: acte.identifiant });
    const f = ouvrir();
    expect(within(f).getAllByRole("radio")).toHaveLength(6);
    expect(within(f).getByText(/retourne chez l'Officier/).textContent).toContain("MUL-EXNAIS-2026-000124 (Mapendo Grace)");
    fireEvent.click(within(f).getByRole("radio", { name: "Nom mal orthographié" }));
    expect(within(f).getByLabelText("Précision (facultative)")).toBeTruthy();
    fireEvent.change(within(f).getByLabelText("Précision (facultative)"), {
      target: { value: "Mapendo avec un seul p" },
    });
    fireEvent.click(within(f).getByRole("button", { name: "Renvoyer à l'Officier" }));
    await waitFor(() => expect(renvoyer).toHaveBeenCalledWith(acte.id, "Nom mal orthographié", "Mapendo avec un seul p"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toBe("MUL-EXNAIS-2026-000124 a été renvoyé à l'Officier pour correction.");
  });

  it("« Autre motif » : le champ devient obligatoire ; le refus reste dans la fenêtre", async () => {
    renvoyer.mockResolvedValue({
      ok: false,
      message: "Écrivez le motif du renvoi (3 caractères au moins), pour que l'Officier sache quoi corriger.",
      champ: "precision",
    });
    const f = ouvrir();
    fireEvent.click(within(f).getByRole("radio", { name: "Autre motif" }));
    const champ = within(f).getByLabelText("Motif (obligatoire)");
    fireEvent.click(within(f).getByRole("button", { name: "Renvoyer à l'Officier" }));
    expect((await within(f).findByRole("alert")).textContent).toContain("Écrivez le motif du renvoi");
    expect(champ.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("« Annuler » ferme sans rien envoyer ; la fenêtre rouverte repart de zéro", () => {
    let f = ouvrir();
    fireEvent.click(within(f).getByRole("radio", { name: "Erreur de date" }));
    fireEvent.click(within(f).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(renvoyer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Renvoyer MUL/ }));
    f = screen.getByRole("dialog");
    expect(
      within(f)
        .getAllByRole("radio")
        .some((r) => (r as HTMLInputElement).checked),
    ).toBe(false);
  });
});

describe("File « À encaisser »", () => {
  const ligne = (n: number, obstacle: string | null = null): LigneFile => ({
    acte: {
      id: `00000000-0000-0000-0000-00000000000${n}`,
      identifiant: `MUL-ATRES-2026-00000${n}`,
      titulaire: `Titulaire ${n}`,
      categorie: n === 2 ? "etranger" : "national",
      type: {
        code: "ATRES",
        libelle: "Attestation de résidence",
        famille: "attestation",
        couleur: "#1565C0",
      },
    },
    transmis: `08 h 1${n}`,
    montant: "18 000 FC",
    obstacle,
  });
  const afficher = (lignes: LigneFile[]) =>
    render(
      <>
        <Annonces />
        <FileAEncaisser lignes={lignes} luA="09 h 00" />
      </>,
    );
  const lignesAffichees = () => [...document.querySelectorAll("[data-a-encaisser]")].map((e) => e.getAttribute("data-a-encaisser"));

  it("lignes dans l'ordre reçu, mention « Étranger », obstacle affiché, « Encaisser » ouvre l'écran d'encaissement", () => {
    afficher([ligne(1, "Saisissez d'abord le taux du jour : cet acte est en dollars."), ligne(2)]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("À encaisser (2 actes transmis par l'Officier)");
    expect(lignesAffichees()).toEqual(["MUL-ATRES-2026-000001", "MUL-ATRES-2026-000002"]);
    expect(document.querySelector("[data-obstacle]")?.textContent).toBe("Saisissez d'abord le taux du jour : cet acte est en dollars.");
    expect(screen.getByText("Étranger")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Encaisser MUL-ATRES-2026-000001" }).getAttribute("href")).toBe("/caissier/encaisser/00000000-0000-0000-0000-000000000001");
  });

  it("acte renvoyé : il quitte la file aussitôt ; l'annonce reste", async () => {
    renvoyer.mockResolvedValue({
      ok: true,
      identifiant: "MUL-ATRES-2026-000001",
    });
    afficher([ligne(1), ligne(2)]);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Renvoyer MUL-ATRES-2026-000001 à l'Officier",
      }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Erreur de date" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Renvoyer à l'Officier",
      }),
    );
    await waitFor(() => expect(lignesAffichees()).toEqual(["MUL-ATRES-2026-000002"]));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("À encaisser (1 acte transmis par l'Officier)");
    expect(screen.getByRole("status").textContent).toBe("MUL-ATRES-2026-000001 a été renvoyé à l'Officier pour correction.");
  });

  it("acte déjà parti (autre poste) : fenêtre fermée, message clair, ligne retirée ; file vide", async () => {
    renvoyer.mockResolvedValue({
      ok: false,
      message: "Cet acte n'est plus en attente de paiement (déjà encaissé, exonéré ou renvoyé) : la liste a été remise à jour.",
    });
    afficher([ligne(1)]);
    fireEvent.click(screen.getByRole("button", { name: /^Renvoyer MUL/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Erreur de date" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Renvoyer à l'Officier",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("n'est plus en attente de paiement");
    expect(screen.getByText(/Aucun acte en attente/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("À encaisser (aucun acte en attente)");
  });
});

describe("Remise à jour automatique", () => {
  it("toutes les 15 s, seulement quand l'onglet est visible ; aussitôt au retour sur l'onglet", () => {
    vi.useFakeTimers();
    let etat: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => etat);
    render(<Actualisation luA="09 h 12" />);
    expect(screen.getByTestId("actualisation").textContent).toBe("Mis à jour à 09 h 12 · automatiquement toutes les 15 s");
    act(() => vi.advanceTimersByTime(14_999));
    expect(rafraichir).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(rafraichir).toHaveBeenCalledTimes(1);
    etat = "hidden";
    act(() => vi.advanceTimersByTime(45_000));
    expect(rafraichir).toHaveBeenCalledTimes(1);
    etat = "visible";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rafraichir).toHaveBeenCalledTimes(2);
  });
});
