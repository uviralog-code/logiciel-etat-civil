// Fichier 19 — fermeture de session d'un compte désactivé, contre le banc (vrai Supabase Auth)
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, sql } from "@/test/banc";
import { adresseInterne } from "@/lib/identifiants";
import { GET } from "./route";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

async function seConnecter(nom: string, motDePasse: string) {
  const bocal = new Map<string, string>();
  const client = createServerClient(banc.url, banc.clePublique, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => bocal.set(name, value)),
    },
  });
  await client.auth.signInWithPassword({ email: adresseInterne(nom), password: motDePasse });
  return [...bocal].map(([n, v]) => `${n}=${v}`).join("; ");
}

describe("/deconnexion", () => {
  it("ferme la session (le jeton ne sert plus) et explique pourquoi à l'écran de connexion", async () => {
    const agent = await creerAgent({ role: "caissier", entite: "BAV" });
    const cookie = await seConnecter(agent.nom, agent.motDePasse);
    expect(sql(`select count(*) from auth.refresh_tokens where user_id = '${agent.id}' and not revoked`)).toBe("1");

    const r = await GET(new NextRequest("http://localhost:3000/deconnexion?motif=desactive", { headers: { cookie } }));

    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost:3000/connexion?motif=desactive");
    expect(r.headers.get("cache-control")).toContain("no-store");
    // Les cookies de session sont effacés dans le navigateur…
    const effaces = r.cookies.getAll().filter((c) => c.name.includes("auth-token"));
    expect(effaces.length).toBeGreaterThan(0);
    expect(effaces.every((c) => c.value === "" && c.maxAge === 0)).toBe(true);
    // … et la session est fermée côté Supabase
    expect(sql(`select count(*) from auth.refresh_tokens where user_id = '${agent.id}' and not revoked`)).toBe("0");
  });

  it("une explication inconnue n'est pas transmise (pas de texte imposé de l'extérieur)", async () => {
    const r = await GET(new NextRequest("http://localhost:3000/deconnexion?motif=<script>"));
    expect(r.headers.get("location")).toBe("http://localhost:3000/connexion");
  });

  it("sans session : simple retour à la connexion", async () => {
    const r = await GET(new NextRequest("http://localhost:3000/deconnexion"));
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://localhost:3000/connexion");
  });
});
