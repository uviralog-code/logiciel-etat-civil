// @vitest-environment node
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demarrerFauxServeurAuth, signerJeton, type FauxServeurAuth } from "@/test/faux-serveur-auth";
import { adresseInterne } from "@/lib/identifiants";
import { configurationSupabase } from "./configuration";
import { creerClientAdmin } from "./admin";
import { rafraichirSession } from "./session-proxy";
import { config as configProxy } from "@/proxy";

let serveur: FauxServeurAuth;
const environnementInitial = { ...process.env };

beforeAll(async () => {
  serveur = await demarrerFauxServeurAuth();
});
afterAll(async () => {
  await serveur.arreter();
});
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = serveur.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = serveur.clePublique;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serveur.cleService;
  serveur.dureeJetons(3600);
  serveur.requetes.length = 0;
});
afterEach(() => {
  process.env = { ...environnementInitial };
});

/** Connexion d'un agent par le module officiel ; renvoie les cookies de session obtenus. */
async function seConnecter(nom: string, motDePasse: string) {
  const bocal = new Map<string, string>();
  const client = createServerClient(serveur.url, serveur.clePublique, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (aEcrire) => aEcrire.forEach(({ name, value }) => bocal.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: adresseInterne(nom), password: motDePasse });
  return { bocal, error };
}

function requeteAvec(bocal: Map<string, string>, chemin = "/officier") {
  const cookie = [...bocal].map(([n, v]) => `${n}=${v}`).join("; ");
  return new NextRequest(`http://localhost:3000${chemin}`, { headers: cookie ? { cookie } : {} });
}

describe("Configuration", () => {
  it("signale clairement une adresse Supabase manquante", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => configurationSupabase()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("signale clairement une clé publique manquante", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => configurationSupabase()).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
  it("refuse de créer le client administrateur sans clé de service", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => creerClientAdmin()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("Connexion par nom d'utilisateur", () => {
  it("l'agent se connecte avec son nom : l'adresse interne est utilisée en coulisses", async () => {
    serveur.ajouterCompte(adresseInterne("mulongwe.officier"), "MotDePasse-2026");
    const { bocal, error } = await seConnecter("Mulongwe.Officier", "MotDePasse-2026");
    expect(error).toBeNull();
    expect([...bocal.keys()].some((n) => n.startsWith("sb-") && n.includes("auth-token"))).toBe(true);
    const appel = serveur.requetes.find((r) => r.chemin.includes("grant_type=password"));
    expect((appel?.corps as { email: string }).email).toBe(adresseInterne("mulongwe.officier"));
  });

  it("un mauvais mot de passe est refusé et ne crée aucune session", async () => {
    serveur.ajouterCompte(adresseInterne("mulongwe.caissier"), "BonMotDePasse");
    const { bocal, error } = await seConnecter("mulongwe.caissier", "MauvaisMotDePasse");
    expect(error?.message).toBe("Invalid login credentials");
    expect(bocal.size).toBe(0);
  });
});

describe("Renouvellement de la session par le proxy", () => {
  it("sans session : la page est servie normalement, personne n'est identifié", async () => {
    const { reponse, identite } = await rafraichirSession(requeteAvec(new Map(), "/connexion"));
    expect(identite).toBeNull();
    expect(reponse.status).toBe(200);
    expect(serveur.requetes.filter((r) => r.chemin.includes("refresh_token"))).toHaveLength(0);
  });

  it("session valide : l'agent est identifié, sans renouvellement inutile", async () => {
    const compte = serveur.ajouterCompte(adresseInterne("kavimvira.officier"), "MotDePasse-2026");
    const { bocal } = await seConnecter("kavimvira.officier", "MotDePasse-2026");
    serveur.requetes.length = 0;
    const { identite } = await rafraichirSession(requeteAvec(bocal));
    expect(identite?.sub).toBe(compte.id);
    expect(serveur.requetes.filter((r) => r.chemin.includes("refresh_token"))).toHaveLength(0);
  });

  it("jeton expiré : il est renouvelé, et les nouveaux cookies sont transmis à la page ET au navigateur", async () => {
    const compte = serveur.ajouterCompte(adresseInterne("kalundu.officier"), "MotDePasse-2026");
    serveur.dureeJetons(-60); // le jeton délivré est déjà expiré
    const { bocal } = await seConnecter("kalundu.officier", "MotDePasse-2026");
    serveur.dureeJetons(3600);
    serveur.requetes.length = 0;

    const { reponse, identite } = await rafraichirSession(requeteAvec(bocal));

    expect(serveur.requetes.filter((r) => r.chemin.includes("grant_type=refresh_token"))).toHaveLength(1);
    expect(identite?.sub).toBe(compte.id);
    const pourNavigateur = reponse.cookies.getAll().filter((c) => c.name.includes("auth-token"));
    expect(pourNavigateur.length).toBeGreaterThan(0);
    expect(pourNavigateur.some((c) => bocal.get(c.name) !== c.value)).toBe(true);
    expect(reponse.headers.get("x-middleware-override-headers")).toContain("cookie");
  });

  it("jeton de renouvellement déjà utilisé (deux onglets) : pas de plantage, personne n'est identifié", async () => {
    serveur.ajouterCompte(adresseInterne("bavira.officier"), "MotDePasse-2026");
    serveur.dureeJetons(-60);
    const { bocal } = await seConnecter("bavira.officier", "MotDePasse-2026");
    serveur.dureeJetons(3600);
    await rafraichirSession(requeteAvec(bocal)); // premier onglet : consomme le jeton
    const { identite } = await rafraichirSession(requeteAvec(bocal)); // second onglet, même cookie
    expect(identite).toBeNull();
  });

  it("cookie falsifié (jeton signé par un tiers) : rejeté", async () => {
    const compte = serveur.ajouterCompte(adresseInterne("faux.agent"), "x");
    const { bocal } = await seConnecter("faux.agent", "x");
    const [nom, valeur] = [...bocal][0];
    const session = JSON.parse(Buffer.from(valeur.replace(/^base64-/, ""), "base64url").toString());
    const [entete, corps] = session.access_token.split(".");
    session.access_token = `${entete}.${corps}.signature-inventee`;
    const falsifie = new Map([[nom, "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url")]]);
    const { identite } = await rafraichirSession(requeteAvec(falsifie));
    expect(identite?.sub).not.toBe(compte.id);
    expect(identite).toBeNull();
  });
});

describe("Sécurité des cookies de session", () => {
  async function cookieRenouvele(adresse: string, entetes: Record<string, string> = {}) {
    serveur.ajouterCompte(adresseInterne(`agent.${Math.random().toString(36).slice(2, 8)}`), "x");
    const compte = serveur.comptes().at(-1)!;
    serveur.dureeJetons(-60);
    const { bocal } = await seConnecter(compte.email.split("@")[0], "x");
    serveur.dureeJetons(3600);
    const cookie = [...bocal].map(([n, v]) => `${n}=${v}`).join("; ");
    const { reponse } = await rafraichirSession(new NextRequest(adresse, { headers: { cookie, ...entetes } }));
    return reponse.cookies.getAll().find((c) => c.name.includes("auth-token"));
  }

  it("en https : le cookie porte l'attribut Secure (jamais envoyé sur une connexion non chiffrée)", async () => {
    expect((await cookieRenouvele("https://etatcivil.exemple.cd/officier"))?.secure).toBe(true);
  });
  it("derrière un hébergeur qui chiffre la connexion (en-tête x-forwarded-proto) : Secure aussi", async () => {
    const c = await cookieRenouvele("http://interne:3000/officier", { "x-forwarded-proto": "https" });
    expect(c?.secure).toBe(true);
  });
  it("en http (serveur local de commune) : pas de Secure, sinon la connexion serait impossible", async () => {
    expect((await cookieRenouvele("http://192.168.1.10:3000/officier"))?.secure).toBe(false);
  });
  it("dans tous les cas : cookie valable pour tout le site, protégé contre l'envoi depuis un autre site", async () => {
    const c = await cookieRenouvele("https://etatcivil.exemple.cd/officier");
    expect(c?.path).toBe("/");
    expect(c?.sameSite).toBe("lax");
  });
});

describe("Client administrateur (clé de service)", () => {
  it("crée un compte de connexion avec l'adresse interne, en présentant la clé de service", async () => {
    const admin = creerClientAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: adresseInterne("kalundu.caissier"),
      password: "Provisoire-7K4PX9",
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(adresseInterne("kalundu.caissier"));
    const appel = serveur.requetes.find((r) => r.chemin === "/auth/v1/admin/users");
    expect(appel?.autorisation).toBe(`Bearer ${serveur.cleService}`);
  });

  it("la clé publique ne permet PAS de créer un compte", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serveur.clePublique;
    const { error } = await creerClientAdmin().auth.admin.createUser({
      email: adresseInterne("pirate.compte"),
      password: "x",
    });
    expect(error?.status).toBe(403);
  });

  it("un jeton inventé n'a aucun pouvoir", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = signerJeton({ role: "service_role" }).replace(/\.[^.]+$/, ".abc");
    const { error } = await creerClientAdmin().auth.admin.createUser({ email: adresseInterne("pirate.deux"), password: "x" });
    expect(error?.status).toBe(403);
  });
});

describe("Pages concernées par le proxy", () => {
  const motif = new RegExp(`^${configProxy.matcher[0]}$`);
  it.each(["/", "/connexion", "/officier/actes/nouveau", "/admin/comptes"])("« %s » passe par le proxy", (chemin) => {
    expect(motif.test(chemin)).toBe(true);
  });
  it.each(["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/fonts/source-sans.woff2", "/logo.png"])(
    "« %s » (fichier statique) n'y passe pas",
    (chemin) => {
      expect(motif.test(chemin)).toBe(false);
    },
  );
});
