// Fichier 16 — comportement de l'écran de connexion (dans un navigateur simulé)
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultatConnexion } from "@/lib/connexion";
import PageConnexion from "./page";

const remplacer = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: remplacer }) }));

const connecterAgent = vi.fn<(...args: unknown[]) => Promise<ResultatConnexion>>();
vi.mock("@/lib/connexion", async (original) => ({
  ...(await original<typeof import("@/lib/connexion")>()),
  connecterAgent: (...args: unknown[]) => connecterAgent(...args),
}));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({ client: "supabase" }) }));

function reseau(enLigne: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => enLigne });
  act(() => {
    window.dispatchEvent(new Event(enLigne ? "online" : "offline"));
  });
}

function saisir(nom: string, motDePasse: string) {
  fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: nom } });
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: motDePasse } });
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
}

beforeEach(() => {
  reseau(true);
  remplacer.mockReset();
  connecterAgent.mockReset();
});
afterEach(cleanup);

describe("Affichage", () => {
  it("reprend la maquette : en-tête officiel, titre, deux champs, bouton, aide mot de passe oublié", () => {
    render(<PageConnexion />);
    expect(screen.getByRole("heading", { level: 1, name: "Registre numérique de l'état civil" })).toBeTruthy();
    expect(screen.getByText("République Démocratique du Congo")).toBeTruthy();
    expect(screen.getByText("Accès réservé aux agents habilités. Toute connexion est enregistrée.")).toBeTruthy();
    expect(screen.getByRole("form", { name: "Connexion" })).toBeTruthy();
    const nom = screen.getByLabelText("Nom d'utilisateur") as HTMLInputElement;
    expect(nom.autocomplete).toBe("username");
    expect(nom.getAttribute("autocapitalize")).toBe("none");
    expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).type).toBe("password");
    expect(screen.getByText(/Mot de passe oublié \? Adressez-vous à l'administrateur/)).toBeTruthy();
  });

  it("le curseur est déjà dans le champ « Nom d'utilisateur »", () => {
    render(<PageConnexion />);
    expect(document.activeElement).toBe(screen.getByLabelText("Nom d'utilisateur"));
  });
});

describe("Voyant du réseau", () => {
  it("vert « En ligne » quand internet est disponible", () => {
    render(<PageConnexion />);
    expect(screen.getByRole("status").textContent).toContain("En ligne — connexion à internet disponible");
  });

  it("passe au jaune « Hors-ligne » dès que la connexion tombe, et revient tout seul", () => {
    render(<PageConnexion />);
    reseau(false);
    expect(screen.getByRole("status").textContent).toContain("Hors-ligne — pas de connexion à internet");
    reseau(true);
    expect(screen.getByRole("status").textContent).toContain("En ligne");
  });
});

describe("Connexion", () => {
  it("réussie : l'agent est envoyé vers la page prévue pour lui", async () => {
    connecterAgent.mockResolvedValue({
      ok: true,
      destination: "/officier",
      profil: {
        nomUtilisateur: "mulongwe.officier", nomComplet: "Amani", role: "officier",
        doitChangerMotDePasse: false, doubleVerification: false, entite: { code: "MUL", nom: "Commune de Mulongwe" },
      },
    });
    render(<PageConnexion />);
    saisir("mulongwe.officier", "MotDePasse-2026");
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/officier"));
    const [client, saisie, contexte] = connecterAgent.mock.calls[0];
    expect(client).toEqual({ client: "supabase" });
    expect(saisie).toEqual({ nom: "mulongwe.officier", motDePasse: "MotDePasse-2026" });
    expect(contexte).toHaveProperty("navigateur");
  });

  it("pendant la vérification : bouton « Connexion en cours… » désactivé (pas de double envoi)", async () => {
    let terminer!: (r: ResultatConnexion) => void;
    connecterAgent.mockReturnValue(new Promise((r) => (terminer = r)));
    render(<PageConnexion />);
    saisir("mulongwe.officier", "MotDePasse-2026");
    const bouton = await screen.findByRole("button", { name: "Connexion en cours…" });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => terminer({ ok: false, message: "Nom d'utilisateur ou mot de passe incorrect.", champ: "motDePasse" }));
    expect((screen.getByRole("button", { name: "Se connecter" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("refusée : message affiché, nom conservé, mot de passe effacé, curseur dans le mot de passe", async () => {
    connecterAgent.mockResolvedValue({ ok: false, message: "Nom d'utilisateur ou mot de passe incorrect.", champ: "motDePasse" });
    render(<PageConnexion />);
    saisir("mulongwe.officier", "mauvais");
    expect((await screen.findByRole("alert")).textContent).toBe("Nom d'utilisateur ou mot de passe incorrect.");
    const nom = screen.getByLabelText("Nom d'utilisateur") as HTMLInputElement;
    const motDePasse = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    await waitFor(() => expect(motDePasse.value).toBe(""));
    expect(nom.value).toBe("mulongwe.officier");
    expect(motDePasse.getAttribute("aria-invalid")).toBe("true");
    expect(motDePasse.getAttribute("aria-describedby")).toBe("erreur-connexion");
    await waitFor(() => expect(document.activeElement).toBe(motDePasse));
    expect(remplacer).not.toHaveBeenCalled();
  });

  it("nom mal formé : le champ du nom est signalé et reçoit le curseur", async () => {
    connecterAgent.mockResolvedValue({ ok: false, message: "Le nom d'utilisateur ne contient que…", champ: "nom" });
    render(<PageConnexion />);
    saisir("mulongwe officier", "x");
    await screen.findByRole("alert");
    const nom = screen.getByLabelText("Nom d'utilisateur");
    expect(nom.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(nom));
  });

  it("deux erreurs de suite : le message est mis à jour", async () => {
    connecterAgent
      .mockResolvedValueOnce({ ok: false, message: "Nom d'utilisateur ou mot de passe incorrect.", champ: "motDePasse" })
      .mockResolvedValueOnce({ ok: false, message: "Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer." });
    render(<PageConnexion />);
    saisir("mulongwe.officier", "a");
    await screen.findByText("Nom d'utilisateur ou mot de passe incorrect.");
    saisir("mulongwe.officier", "b");
    expect((await screen.findByRole("alert")).textContent).toContain("Trop de tentatives");
  });
});

describe("Bouton « Afficher » du mot de passe", () => {
  it("affiche puis masque le mot de passe, sans envoyer le formulaire", () => {
    render(<PageConnexion />);
    const champ = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    fireEvent.change(champ, { target: { value: "MotDePasse-2026" } });
    const bouton = screen.getByRole("button", { name: "Afficher le mot de passe" });
    expect(bouton.getAttribute("aria-pressed")).toBe("false");
    expect(bouton.textContent).toBe("Afficher");

    fireEvent.click(bouton);
    expect(champ.type).toBe("text");
    expect(champ.value).toBe("MotDePasse-2026");
    const masquer = screen.getByRole("button", { name: "Masquer le mot de passe" });
    expect(masquer.getAttribute("aria-pressed")).toBe("true");
    expect(masquer.textContent).toBe("Masquer");

    fireEvent.click(masquer);
    expect(champ.type).toBe("password");
    expect(connecterAgent).not.toHaveBeenCalled();
  });

  it("le mot de passe est masqué à nouveau dès l'envoi du formulaire", async () => {
    connecterAgent.mockResolvedValue({ ok: false, message: "Nom d'utilisateur ou mot de passe incorrect.", champ: "motDePasse" });
    render(<PageConnexion />);
    fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    saisir("mulongwe.officier", "mauvais");
    await screen.findByRole("alert");
    expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).type).toBe("password");
    expect(screen.getByRole("button", { name: "Afficher le mot de passe" })).toBeTruthy();
  });
});

describe("Arrivée après une déconnexion imposée ou une session expirée", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("compte désactivé : l'écran explique pourquoi la session a été fermée", () => {
    window.history.replaceState(null, "", "/connexion?motif=desactive");
    render(<PageConnexion />);
    expect(screen.getByText(/Ce compte a été désactivé : la session a été fermée/)).toBeTruthy();
  });

  it("une explication inconnue dans l'adresse n'affiche rien", () => {
    window.history.replaceState(null, "", "/connexion?motif=nimporte-quoi");
    render(<PageConnexion />);
    expect(screen.queryByText(/désactivé/)).toBeNull();
  });

  it("après la connexion, retour à la page où l'agent travaillait (dans son espace)", async () => {
    window.history.replaceState(null, "", "/connexion?suite=%2Fofficier%2Fscanner");
    connecterAgent.mockResolvedValue({
      ok: true, destination: "/officier",
      profil: { nomUtilisateur: "a.b", nomComplet: "A", role: "officier", doitChangerMotDePasse: false, doubleVerification: false, entite: null },
    });
    render(<PageConnexion />);
    saisir("mulongwe.officier", "MotDePasse-2026");
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/officier/scanner"));
  });

  it("page demandée dans un autre espace : ignorée, l'agent va dans le sien", async () => {
    window.history.replaceState(null, "", "/connexion?suite=%2Fadmin%2Fcomptes");
    connecterAgent.mockResolvedValue({
      ok: true, destination: "/caissier",
      profil: { nomUtilisateur: "a.b", nomComplet: "A", role: "caissier", doitChangerMotDePasse: false, doubleVerification: false, entite: null },
    });
    render(<PageConnexion />);
    saisir("kalundu.caissier", "MotDePasse-2026");
    await waitFor(() => expect(remplacer).toHaveBeenCalledWith("/caissier"));
  });
});
