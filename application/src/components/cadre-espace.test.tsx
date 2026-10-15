import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConnecte } from "@/lib/session";
import { CadreEspace } from "./cadre-espace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...reste }: { href: string; children: React.ReactNode }) => <a href={href} {...reste}>{children}</a>,
}));
vi.mock("@/lib/supabase/navigateur", () => ({ creerClientNavigateur: () => ({}) }));
afterEach(cleanup);

const officier: AgentConnecte = {
  id: "u-1", actif: true, niveau: "aal1",
  profil: {
    nomUtilisateur: "mulongwe.officier", nomComplet: "Bahati Mugisho", role: "officier",
    doitChangerMotDePasse: false, doubleVerification: false, entite: { code: "MUL", nom: "Commune de Mulongwe" },
  },
};

describe("Cadre des écrans de travail", () => {
  it("menu de l'officier, avec l'entrée active signalée (tout est disponible)", () => {
    render(<CadreEspace agent={officier} actif="/officier"><p>contenu</p></CadreEspace>);
    const menu = screen.getByRole("navigation", { name: "Menu principal" });
    expect(within(menu).getByText("État civil · Uvira")).toBeTruthy();
    expect(within(menu).getByText("Commune de Mulongwe")).toBeTruthy();
    const accueil = within(menu).getByRole("link", { name: "Accueil" });
    expect(accueil.getAttribute("aria-current")).toBe("page");
    expect(accueil.getAttribute("href")).toBe("/officier");
    // Étape 6 terminée (fichier 36) : tout le menu de l'officier est disponible
    expect(within(menu).getByRole("link", { name: "Scanner" }).getAttribute("href")).toBe("/officier/scanner");
    expect(within(menu).getByRole("link", { name: "Anciens registres" }).getAttribute("href")).toBe("/officier/anciens-registres");
    expect(menu.querySelectorAll("[aria-disabled=true]")).toHaveLength(0);
    expect(within(menu).getByRole("button", { name: "Se déconnecter" })).toBeTruthy();
  });

  it("en-tête : date, réseau, nom et rôle de l'agent ; le contenu de la page est affiché", () => {
    render(<CadreEspace agent={officier} actif="/officier"><p>contenu de la page</p></CadreEspace>);
    const entete = screen.getByRole("banner");
    expect(within(entete).getByText(/^[A-Z][a-zé]+ \d{1,2} [a-zéû]+ \d{4}$/)).toBeTruthy();
    expect(within(entete).getByRole("status").textContent).toBe("En ligne");
    expect(entete.textContent).toContain("Bahati Mugisho · Officier d'état civil");
    expect(screen.getByRole("main").textContent).toBe("contenu de la page");
  });

  it("administrateur : son propre menu, sans entité", () => {
    const admin: AgentConnecte = {
      ...officier, niveau: "aal2",
      profil: { ...officier.profil, nomComplet: "Abbé Justin Nkunzi", role: "admin", doubleVerification: true, entite: null },
    };
    render(<CadreEspace agent={admin} actif="/admin"><p /></CadreEspace>);
    expect(screen.getByText("Administration · CDJP/Bukavu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tableau de bord" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("banner").textContent).toContain("Abbé Justin Nkunzi · Administrateur principal");
  });
});

describe("Page introuvable", () => {
  it("en français, avec un retour vers son espace", async () => {
    const { default: PageIntrouvable } = await import("@/app/not-found");
    render(<PageIntrouvable />);
    expect(screen.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Retour à mon espace" }).getAttribute("href")).toBe("/");
  });
});
