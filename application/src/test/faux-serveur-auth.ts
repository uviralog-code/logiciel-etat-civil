/**
 * FAUX SERVEUR DE CONNEXION (tests uniquement)
 *
 * Le vrai serveur de connexion de Supabase ne peut pas être compilé dans
 * l'environnement de test. Ce serveur reproduit fidèlement les échanges que
 * l'application utilise, pour que les modules OFFICIELS de Supabase côté
 * application (supabase-js, @supabase/ssr) soient testés pour de vrai :
 *
 *   POST /auth/v1/token?grant_type=password       connexion par mot de passe
 *   POST /auth/v1/token?grant_type=refresh_token  renouvellement (usage unique)
 *   GET  /auth/v1/user                            vérification du jeton
 *   POST /auth/v1/admin/users                     création d'un compte (clé de service)
 *
 * Les jetons sont de vrais JWT signés (HS256), avec date d'expiration.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const SECRET = "secret-de-test-au-moins-32-caracteres-de-long";

function base64url(donnees: Buffer | string) {
  return Buffer.from(donnees).toString("base64url");
}

export function signerJeton(contenu: Record<string, unknown>) {
  const entete = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = base64url(JSON.stringify(contenu));
  const signature = createHmac("sha256", SECRET).update(`${entete}.${corps}`).digest("base64url");
  return `${entete}.${corps}.${signature}`;
}

function verifierJeton(jeton: string): Record<string, unknown> | null {
  const [entete, corps, signature] = jeton.split(".");
  if (!entete || !corps || !signature) return null;
  const attendue = createHmac("sha256", SECRET).update(`${entete}.${corps}`).digest("base64url");
  if (attendue !== signature) return null;
  const contenu = JSON.parse(Buffer.from(corps, "base64url").toString());
  if (typeof contenu.exp === "number" && contenu.exp * 1000 < Date.now()) return null;
  return contenu;
}

type Compte = { id: string; email: string; motDePasse: string; metadonnees: Record<string, unknown> };

export type Requete = { methode: string; chemin: string; autorisation?: string; corps?: unknown };

export type FauxServeurAuth = {
  url: string;
  clePublique: string;
  cleService: string;
  requetes: Requete[];
  /** Durée de vie des prochains jetons d'accès, en secondes (négatif = déjà expiré). */
  dureeJetons: (secondes: number) => void;
  ajouterCompte: (email: string, motDePasse: string) => Compte;
  comptes: () => Compte[];
  arreter: () => Promise<void>;
};

async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  for await (const m of req) morceaux.push(m as Buffer);
  const texte = Buffer.concat(morceaux).toString();
  return texte ? JSON.parse(texte) : undefined;
}

export async function demarrerFauxServeurAuth(): Promise<FauxServeurAuth> {
  const comptes = new Map<string, Compte>();
  const renouvellements = new Map<string, { compte: string; utilise: boolean }>();
  const requetes: Requete[] = [];
  let duree = 3600;

  const utilisateur = (c: Compte) => ({
    id: c.id,
    aud: "authenticated",
    role: "authenticated",
    email: c.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: c.metadonnees,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const session = (c: Compte) => {
    const maintenant = Math.floor(Date.now() / 1000);
    const renouvellement = randomBytes(16).toString("hex");
    renouvellements.set(renouvellement, { compte: c.id, utilise: false });
    return {
      access_token: signerJeton({
        sub: c.id, email: c.email, role: "authenticated", aud: "authenticated",
        iat: maintenant, exp: maintenant + duree, session_id: randomUUID(),
      }),
      token_type: "bearer",
      expires_in: duree,
      expires_at: maintenant + duree,
      refresh_token: renouvellement,
      user: utilisateur(c),
    };
  };

  const clePublique = signerJeton({ role: "anon", iss: "supabase" });
  const cleService = signerJeton({ role: "service_role", iss: "supabase" });

  const serveur: Server = createServer(async (req, res) => {
    const adresse = new URL(req.url ?? "/", "http://local");
    const corps = req.method === "POST" ? await lireCorps(req) : undefined;
    requetes.push({ methode: req.method ?? "", chemin: adresse.pathname + adresse.search, autorisation: req.headers.authorization, corps });
    const repondre = (code: number, donnees: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(donnees));
    };
    const jeton = (req.headers.authorization ?? "").replace(/^Bearer /, "");

    if (req.method === "POST" && adresse.pathname === "/auth/v1/token") {
      const type = adresse.searchParams.get("grant_type");
      const c = corps as Record<string, string>;
      if (type === "password") {
        const compte = [...comptes.values()].find((x) => x.email === c.email);
        if (!compte || compte.motDePasse !== c.password) {
          return repondre(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        }
        return repondre(200, session(compte));
      }
      if (type === "refresh_token") {
        const r = renouvellements.get(c.refresh_token);
        if (!r) return repondre(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
        if (r.utilise) return repondre(400, { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" });
        r.utilise = true;
        return repondre(200, session(comptes.get(r.compte)!));
      }
    }

    if (req.method === "GET" && adresse.pathname === "/auth/v1/user") {
      const contenu = verifierJeton(jeton);
      const compte = contenu && comptes.get(String(contenu.sub));
      if (!compte) return repondre(403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
      return repondre(200, utilisateur(compte));
    }

    if (req.method === "POST" && adresse.pathname === "/auth/v1/admin/users") {
      if (verifierJeton(jeton)?.role !== "service_role") {
        return repondre(403, { code: 403, error_code: "not_admin", msg: "User not allowed" });
      }
      const c = corps as { email: string; password: string; user_metadata?: Record<string, unknown> };
      if ([...comptes.values()].some((x) => x.email === c.email)) {
        return repondre(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
      }
      const compte = { id: randomUUID(), email: c.email, motDePasse: c.password, metadonnees: c.user_metadata ?? {} };
      comptes.set(compte.id, compte);
      return repondre(200, utilisateur(compte));
    }

    repondre(404, { code: 404, msg: `Non simulé : ${req.method} ${adresse.pathname}` });
  });

  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  const { port } = serveur.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    clePublique,
    cleService,
    requetes,
    dureeJetons: (s) => { duree = s; },
    ajouterCompte: (email, motDePasse) => {
      const compte = { id: randomUUID(), email, motDePasse, metadonnees: {} };
      comptes.set(compte.id, compte);
      return compte;
    },
    comptes: () => [...comptes.values()],
    arreter: () => new Promise((ok) => serveur.close(() => ok())),
  };
}
