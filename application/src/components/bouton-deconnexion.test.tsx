import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoutonDeconnexion } from "./bouton-deconnexion";

const remplacer = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: remplacer }) }));
const signOut = vi.fn();
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({ auth: { signOut } }) }));

beforeEach(() => {
  remplacer.mockReset();
  signOut.mockReset();
});
afterEach(cleanup);

describe("Bouton « Se déconnecter »", () => {
  it("ferme la session de ce poste seulement, puis revient à la connexion", async () => {
    signOut.mockResolvedValue({ error: null });
    render(<BoutonDeconnexion />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/connexion"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("n'envoie jamais le formulaire qui l'entoure", () => {
    const envoi = vi.fn((e: Event) => e.preventDefault());
    render(
      <form onSubmit={(e) => envoi(e.nativeEvent)}>
        <BoutonDeconnexion />
      </form>,
    );
    signOut.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(envoi).not.toHaveBeenCalled();
  });

  it("échec (pas d'internet) : message clair, l'agent reste sur la page", async () => {
    signOut.mockResolvedValue({ error: { message: "fetch failed" } });
    render(<BoutonDeconnexion />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect((await screen.findByRole("alert")).textContent).toContain("La déconnexion a échoué");
    expect(remplacer).not.toHaveBeenCalled();
  });
});
