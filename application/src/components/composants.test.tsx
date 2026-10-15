import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LisereDrapeau } from "./lisere-drapeau";
import { PastilleStatut } from "./pastille-statut";

afterEach(cleanup);

describe("Liseré aux couleurs du drapeau", () => {
  it("compte 5 bandes et reste invisible pour les lecteurs d'écran", () => {
    render(<LisereDrapeau />);
    const lisere = screen.getByTestId("lisere-drapeau");
    expect(lisere.children).toHaveLength(5);
    expect(lisere.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Pastille de statut", () => {
  it("affiche le libellé en français et les bonnes couleurs", () => {
    render(<PastilleStatut statut="en_attente_paiement" />);
    const pastille = screen.getByText("En attente de paiement");
    expect(pastille.style.backgroundColor).toBe("rgb(255, 244, 214)");
    expect(pastille.style.color).toBe("rgb(107, 78, 0)");
  });
});
