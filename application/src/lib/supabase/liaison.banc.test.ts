// Fichier 15 rejoué contre le banc d'essai : VRAI service de connexion Supabase.
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { brancherBanc, creerCompte, nomUnique, signer, sql } from "@/test/banc";
import { adresseInterne } from "@/lib/identifiants";
import { creerClientAdmin } from "./admin";
import { rafraichirSession } from "./session-proxy";

let banc: ReturnType<typeof brancherBanc>;
beforeEach(() => {
  banc = brancherBanc();
});

/** Connexion par le module officiel ; renvoie les cookies de session obtenus. */
async function seConnecter(nom: string, motDePasse: string) {
  const bocal = new Map<string, string>();
  const client = createServerClient(banc.url, banc.clePublique, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (aEcrire) => aEcrire.forEach(({ name, value }) => (value ? bocal.set(name, value) : bocal.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: adresseInterne(nom), password: motDePasse });
  return { bocal, error };
}

/** La session est rangée dans un ou plusieurs cookies (découpée si elle est longue). */
function lireSession(bocal: Map<string, string>) {
  const morceaux = [...bocal]
    .filter(([n]) => n.includes("auth-token"))
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  const valeur = morceaux.map(([, v]) => v).join("");
  const nom = morceaux[0][0].replace(/\.\d+$/, "");
  return { nom, session: JSON.parse(Buffer.from(valeur.replace(/^base64-/, ""), "base64url").toString()) };
}
function ecrireSession(nom: string, session: unknown) {
  return new Map([[nom, "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url")]]);
}

/** Simule le passage du temps : même session, mais jeton d'accès expiré depuis une minute. */
function vieillir(bocal: Map<string, string>) {
  const { nom, session } = lireSession(bocal);
  const charge = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
  const maintenant = Math.floor(Date.now() / 1000);
  session.access_token = signer({ ...charge, iat: maintenant - 3660, exp: maintenant - 60 }, banc.secret);
  session.expires_at = maintenant - 60;
  return ecrireSession(nom, session);
}

function requeteAvec(bocal: Map<string, string>, adresse = "http://localhost:3000/officier", entetes: Record<string, string> = {}) {
  const cookie = [...bocal].map(([n, v]) => `${n}=${v}`).join("; ");
  return new NextRequest(adresse, { headers: { ...(cookie ? { cookie } : {}), ...entetes } });
}

const jetonsDeRenouvellement = (id: string) =>
  Number(sql(`select count(*) from auth.refresh_tokens where user_id = '${id}'`));

describe("Connexion par nom d'utilisateur (vrai service Auth)", () => {
  it("l'agent se connecte avec son nom ; le compte est bien enregistré avec l'adresse interne", async () => {
    const nom = nomUnique("mulongwe");
    const id = await creerCompte(nom, "MotDePasse-2026");
    expect(sql(`select email from auth.users where id = '${id}'`)).toBe(adresseInterne(nom));
    const { bocal, error } = await seConnecter(nom.toUpperCase(), "MotDePasse-2026");
    expect(error).toBeNull();
    expect([...bocal.keys()].some((n) => n.startsWith("sb-") && n.includes("auth-token"))).toBe(true);
  });

  it("un mauvais mot de passe est refusé et ne crée aucune session", async () => {
    const nom = nomUnique();
    await creerCompte(nom, "BonMotDePasse-1");
    const { bocal, error } = await seConnecter(nom, "MauvaisMotDePasse");
    expect(error?.message).toBe("Invalid login credentials");
    expect(bocal.size).toBe(0);
  });

  it("un nom inconnu reçoit exactement la même réponse (on ne révèle pas quels comptes existent)", async () => {
    const { error } = await seConnecter(nomUnique("inconnu"), "MotDePasse-2026");
    expect(error?.message).toBe("Invalid login credentials");
  });
});

describe("Renouvellement de la session par le proxy (vrai service Auth)", () => {
  it("sans session : la page est servie normalement, personne n'est identifié", async () => {
    const { reponse, identite } = await rafraichirSession(requeteAvec(new Map(), "http://localhost:3000/connexion"));
    expect(identite).toBeNull();
    expect(reponse.status).toBe(200);
  });

  it("session valide : l'agent est identifié, sans renouvellement inutile", async () => {
    const nom = nomUnique();
    const id = await creerCompte(nom, "MotDePasse-2026");
    const { bocal } = await seConnecter(nom, "MotDePasse-2026");
    const { identite } = await rafraichirSession(requeteAvec(bocal));
    expect(identite?.sub).toBe(id);
    expect(identite?.role).toBe("authenticated");
    expect(jetonsDeRenouvellement(id)).toBe(1);
  });

  it("jeton expiré : renouvelé auprès du service, nouveaux cookies pour la page ET le navigateur", async () => {
    const nom = nomUnique();
    const id = await creerCompte(nom, "MotDePasse-2026");
    const { bocal } = await seConnecter(nom, "MotDePasse-2026");
    const ancien = vieillir(bocal);

    const { reponse, identite } = await rafraichirSession(requeteAvec(ancien));

    expect(identite?.sub).toBe(id);
    expect(jetonsDeRenouvellement(id)).toBe(2); // l'ancien est révoqué, un nouveau est émis
    expect(sql(`select count(*) from auth.refresh_tokens where user_id = '${id}' and revoked`)).toBe("1");
    const pourNavigateur = reponse.cookies.getAll().filter((c) => c.name.includes("auth-token") && c.value);
    expect(pourNavigateur.length).toBeGreaterThan(0);
    expect(reponse.headers.get("x-middleware-override-headers")).toContain("cookie");
    expect(reponse.headers.get("cache-control")).toContain("no-store");
  });

  it("deux onglets renouvellent en même temps : les deux restent connectés (tolérance prévue par Supabase)", async () => {
    const nom = nomUnique();
    const id = await creerCompte(nom, "MotDePasse-2026");
    const { bocal } = await seConnecter(nom, "MotDePasse-2026");
    const ancien = vieillir(bocal);
    const [a, b] = await Promise.all([rafraichirSession(requeteAvec(ancien)), rafraichirSession(requeteAvec(ancien))]);
    expect(a.identite?.sub).toBe(id);
    expect(b.identite?.sub).toBe(id);
  });

  it("cookie falsifié (jeton signé par un tiers) : rejeté par le service", async () => {
    const nom = nomUnique();
    await creerCompte(nom, "x-MotDePasse-1");
    const { bocal } = await seConnecter(nom, "x-MotDePasse-1");
    const { nom: cookie, session } = lireSession(bocal);
    const charge = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
    session.access_token = signer({ ...charge, role: "service_role" }, "secret-invente-par-un-pirate");
    const { identite } = await rafraichirSession(requeteAvec(ecrireSession(cookie, session)));
    expect(identite).toBeNull();
  });
});

describe("Sécurité des cookies de session (vrai service Auth)", () => {
  async function cookieRenouvele(adresse: string, entetes: Record<string, string> = {}) {
    const nom = nomUnique();
    await creerCompte(nom, "MotDePasse-2026");
    const { bocal } = await seConnecter(nom, "MotDePasse-2026");
    const { reponse } = await rafraichirSession(requeteAvec(vieillir(bocal), adresse, entetes));
    return reponse.cookies.getAll().find((c) => c.name.includes("auth-token") && c.value);
  }

  it("en https : attribut Secure", async () => {
    expect((await cookieRenouvele("https://etatcivil.exemple.cd/officier"))?.secure).toBe(true);
  });
  it("derrière un hébergeur qui chiffre la connexion (x-forwarded-proto) : Secure", async () => {
    expect((await cookieRenouvele("http://interne:3000/officier", { "x-forwarded-proto": "https" }))?.secure).toBe(true);
  });
  it("en http (serveur local de commune) : pas de Secure", async () => {
    expect((await cookieRenouvele("http://192.168.1.10:3000/officier"))?.secure).toBe(false);
  });
  it("valable pour tout le site, protégé contre l'envoi depuis un autre site", async () => {
    const c = await cookieRenouvele("https://etatcivil.exemple.cd/officier");
    expect(c?.path).toBe("/");
    expect(c?.sameSite).toBe("lax");
  });
});

describe("Client administrateur (vrai service Auth)", () => {
  it("crée un compte avec la clé de service", async () => {
    const nom = nomUnique("kalundu");
    const { data, error } = await creerClientAdmin().auth.admin.createUser({
      email: adresseInterne(nom),
      password: "Provisoire-7K4PX9",
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(adresseInterne(nom));
  });

  it("la clé publique ne permet PAS de créer un compte", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = banc.clePublique;
    const { error } = await creerClientAdmin().auth.admin.createUser({ email: adresseInterne(nomUnique("pirate")), password: "x-12345678" });
    expect(error?.status).toBe(403);
  });

  it("une clé inventée est refusée dès l'entrée, comme chez Supabase", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = signer({ role: "service_role" }, "secret-invente");
    const { error } = await creerClientAdmin().auth.admin.createUser({ email: adresseInterne(nomUnique("pirate")), password: "x-12345678" });
    expect(error?.status).toBe(401);
  });

  it("l'inscription libre est fermée : seul l'administrateur crée les comptes", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const visiteur = createClient(banc.url, banc.clePublique, { auth: { persistSession: false } });
    const { error } = await visiteur.auth.signUp({ email: adresseInterne(nomUnique("intrus")), password: "MotDePasse-2026" });
    expect(error).not.toBeNull();
  });
});
