// Fichier 19 — premier filtre du proxy, contre le banc (vrai Supabase Auth)
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerAgent, signer } from "@/test/banc";
import { adresseInterne } from "@/lib/identifiants";
import { proxy } from "./proxy";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

async function cookiesDe(nom: string, motDePasse: string) {
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
const demander = (chemin: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost:3000${chemin}`, { headers: cookie ? { cookie } : {} }));

describe("Sans session", () => {
  it.each(["/", "/officier", "/caissier/cloture", "/admin/comptes", "/mot-de-passe", "/verification", "/page-inconnue"])(
    "« %s » → redirigé vers la connexion, sans préparer la page",
    async (chemin) => {
      const r = await demander(chemin);
      expect(r.status).toBe(307);
      const cible = new URL(r.headers.get("location")!);
      expect(cible.pathname).toBe("/connexion");
      // La page demandée est mémorisée pour y revenir après la connexion (sauf « / »)
      expect(cible.searchParams.get("suite")).toBe(chemin === "/" ? null : chemin);
      expect(r.headers.get("cache-control")).toContain("no-store");
    },
  );
  it.each(["/connexion", "/connexion?motif=desactive", "/deconnexion"])("« %s » reste accessible", async (chemin) => {
    const r = await demander(chemin);
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });
  it("un cookie de session falsifié ne passe pas", async () => {
    const faux = signer({ sub: "00000000-0000-0000-0000-000000000001", role: "authenticated", exp: 9999999999 }, "secret-pirate");
    const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: faux, refresh_token: "x", expires_at: 9999999999 })).toString("base64url")}`;
    const r = await demander("/officier", cookie);
    expect(r.status).toBe(307);
  });
});

describe("Avec une session", () => {
  it("la page demandée est préparée (le contrôle du rôle se fait ensuite dans la page)", async () => {
    const agent = await creerAgent({ role: "officier", entite: "MUL" });
    const cookie = await cookiesDe(agent.nom, agent.motDePasse);
    for (const chemin of ["/officier", "/caissier", "/"]) {
      const r = await demander(chemin, cookie);
      expect(r.status).toBe(200);
      expect(r.headers.get("location")).toBeNull();
    }
  });
});
