// =====================================================================
// BANC D'ESSAI SUPABASE LOCAL
// ---------------------------------------------------------------------
// Assemble sur l'ordinateur de test les pièces officielles de Supabase :
//   - la base PostgreSQL avec toutes les migrations du logiciel ;
//   - le VRAI service de connexion de Supabase (« Auth », binaire officiel) ;
//   - le VRAI accès aux données (« PostgREST », binaire officiel) ;
//   - le VRAI stockage des fichiers (« Storage », construit une seule fois
//     depuis ses sources officielles, avec Node 24 ; fichier 33) ;
//   - une passerelle qui les présente à la même adresse que Supabase
//     (/auth/v1, /rest/v1 et /storage/v1) et exige la clé publique.
//
// Ce banc N'EST PAS déployé : il sert uniquement aux tests.
//
// Utilisation :
//   node tests/banc/banc.mjs            démarre le banc et affiche ses réglages
//   import { demarrerBanc } from "…"    depuis les tests automatiques
//
// Prérequis : PostgreSQL 16 accessible en TCP (127.0.0.1, port BANC_PGPORT,
// 5433 par défaut) avec l'utilisateur « postgres » en accès de confiance.
// Les binaires officiels (Auth, PostgREST) et les sources de Storage sont
// téléchargés une seule fois depuis GitHub, et Node 24 depuis le registre
// npm, dans le dossier BANC_OUTILS (~/.cache/banc-etat-civil par défaut).
// =====================================================================
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "../..");
const MIGRATIONS = path.join(RACINE, "supabase/migrations");

export const VERSIONS = { auth: "v2.185.0", postgrest: "v12.2.3", storage: "v1.70.0", node: "24.19.0" };
const OUTILS = process.env.BANC_OUTILS ?? path.join(os.homedir(), ".cache/banc-etat-civil");
const PG = {
  hote: process.env.BANC_PGHOST ?? "127.0.0.1",
  port: process.env.BANC_PGPORT ?? "5433",
  utilisateur: process.env.BANC_PGUSER ?? "postgres",
};
const BASE = process.env.BANC_BASE ?? "etat_civil_banc";

// ---------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------
function executer(commande, args, options = {}) {
  const r = spawnSync(commande, args, { encoding: "utf8", ...options });
  if (r.status !== 0) {
    throw new Error(`Échec de « ${commande} ${args.join(" ")} » :\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

const envPsql = { ...process.env, PGHOST: PG.hote, PGPORT: PG.port, PGUSER: PG.utilisateur };

/** Exécute du SQL dans une base (par défaut la base du banc) et renvoie le texte produit. */
export function sql(requete, base = BASE) {
  return executer("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", base, "-c", requete], {
    env: { ...envPsql, PGOPTIONS: "-c client_min_messages=warning" },
  }).trim();
}

function fichierSql(fichier, base = BASE) {
  executer("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", base, "-f", fichier], {
    env: { ...envPsql, PGOPTIONS: "-c client_min_messages=warning" },
  });
}

function portLibre() {
  return new Promise((resoudre, rejeter) => {
    const s = net.createServer();
    s.unref();
    s.on("error", rejeter);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resoudre(port));
    });
  });
}

/** Jeton signé (HS256), comme les clés publique et de service d'un projet Supabase. */
export function signer(charge, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(charge)}`;
  return `${corps}.${createHmac("sha256", secret).update(corps).digest("base64url")}`;
}

async function attendre(url, description, delaiMs = 30000) {
  const fin = Date.now() + delaiMs;
  let derniere;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
      derniere = `HTTP ${r.status}`;
    } catch (e) {
      derniere = e.message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`${description} ne répond pas (${derniere}).`);
}

// ---------------------------------------------------------------------
// 1. Binaires officiels
// ---------------------------------------------------------------------
function outils() {
  mkdirSync(OUTILS, { recursive: true });
  const dossierAuth = path.join(OUTILS, `auth-${VERSIONS.auth}`);
  const binAuth = path.join(dossierAuth, "auth");
  if (!existsSync(binAuth)) {
    mkdirSync(dossierAuth, { recursive: true });
    const archive = path.join(OUTILS, `auth-${VERSIONS.auth}.tar.gz`);
    executer("curl", ["-fsSL", "-o", archive,
      `https://github.com/supabase/auth/releases/download/${VERSIONS.auth}/auth-${VERSIONS.auth}-x86.tar.gz`]);
    executer("tar", ["xzf", archive, "-C", dossierAuth]);
  }
  const binRest = path.join(OUTILS, `postgrest-${VERSIONS.postgrest}`);
  if (!existsSync(binRest)) {
    const archive = path.join(OUTILS, `postgrest-${VERSIONS.postgrest}.tar.xz`);
    executer("curl", ["-fsSL", "-o", archive,
      `https://github.com/PostgREST/postgrest/releases/download/${VERSIONS.postgrest}/postgrest-${VERSIONS.postgrest}-linux-static-x64.tar.xz`]);
    executer("tar", ["xJf", archive, "-C", OUTILS]);
    executer("mv", [path.join(OUTILS, "postgrest"), binRest]);
  }
  return { binAuth, migrationsAuth: path.join(dossierAuth, "migrations"), binRest, ...outilsStorage() };
}

/**
 * Storage n'est pas publié en binaire : on le construit une seule fois depuis
 * ses sources officielles (étiquette VERSIONS.storage). Il exige Node 24,
 * pris dans le registre npm (paquet officiel node-linux-x64).
 */
function outilsStorage() {
  const dossierNode = path.join(OUTILS, `node-${VERSIONS.node}`);
  const binNode = path.join(dossierNode, "package/bin/node");
  if (!existsSync(binNode)) {
    mkdirSync(dossierNode, { recursive: true });
    executer("npm", ["pack", "-q", `node-linux-x64@${VERSIONS.node}`], { cwd: dossierNode });
    executer("tar", ["xzf", `node-linux-x64-${VERSIONS.node}.tgz`], { cwd: dossierNode });
  }
  const dossierStorage = path.join(OUTILS, `storage-${VERSIONS.storage}`);
  const fait = path.join(dossierStorage, ".construit");
  if (!existsSync(fait)) {
    rmSync(dossierStorage, { recursive: true, force: true });
    executer("git", ["clone", "-q", "-c", "advice.detachedHead=false", "--depth", "1", "--branch", VERSIONS.storage,
      "https://github.com/supabase/storage", dossierStorage]);
    const env = { ...process.env, PATH: `${path.dirname(binNode)}:${process.env.PATH}` };
    const npm = (args) => executer("npm", args, { cwd: dossierStorage, env, maxBuffer: 64 * 1024 * 1024 });
    npm(["ci", "--engine-strict=false", "--ignore-scripts", "--no-audit", "--no-fund"]);
    npm(["rebuild", "fs-xattr", `--nodedir=${path.join(dossierNode, "package")}`]); // module natif utilisé par Storage
    npm(["run", "build"]);
    writeFileSync(fait, VERSIONS.storage);
  }
  return { binNode, dossierStorage };
}

// ---------------------------------------------------------------------
// 2. Passerelle (le rôle joué par Supabase devant ses services)
// ---------------------------------------------------------------------
function passerelle({ portAuth, portRest, portStorage, clesValides }) {
  return http.createServer((req, res) => {
    const origine = req.headers.origin;
    const cors = {
      "access-control-allow-origin": origine ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      // Les en-têtes du téléversement reprenable (tus) doivent être lisibles par le navigateur
      "access-control-expose-headers":
        "content-range, x-total-count, x-supabase-api-version, location, upload-offset, upload-length, " +
        "tus-resumable, tus-version, tus-max-size, tus-extension, upload-metadata, upload-expires",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }

    const url = new URL(req.url, "http://passerelle");
    let port;
    let chemin;
    if (url.pathname.startsWith("/auth/v1/")) {
      port = portAuth;
      chemin = url.pathname.slice("/auth/v1".length);
    } else if (url.pathname.startsWith("/rest/v1/") || url.pathname === "/rest/v1") {
      port = portRest;
      chemin = url.pathname.slice("/rest/v1".length) || "/";
    } else if (url.pathname.startsWith("/storage/v1/")) {
      port = portStorage;
      chemin = url.pathname.slice("/storage/v1".length);
    } else {
      res.writeHead(404, { "content-type": "application/json", ...cors });
      return res.end(JSON.stringify({ message: "no Route matched with those values" }));
    }

    // Comme Supabase : toute requête doit présenter une clé du projet, sauf
    // pour Storage, qui contrôle lui-même l'accès (un lien signé s'ouvre seul)
    const cle = req.headers.apikey ?? url.searchParams.get("apikey");
    if (port !== portStorage && (!cle || !clesValides.includes(cle))) {
      res.writeHead(401, { "content-type": "application/json", ...cors });
      return res.end(JSON.stringify({ message: "Invalid API key" }));
    }

    const ipClient = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "";
    const entetes = { ...req.headers, host: `127.0.0.1:${port}` };
    entetes["x-forwarded-for"] = req.headers["x-forwarded-for"]
      ? `${req.headers["x-forwarded-for"]}, ${ipClient}`
      : ipClient;
    entetes["x-forwarded-proto"] = req.headers["x-forwarded-proto"] ?? "http";
    entetes["x-forwarded-host"] = req.headers.host ?? "";
    if (port === portStorage) entetes["x-forwarded-prefix"] = "/storage/v1";

    const amont = http.request(
      { host: "127.0.0.1", port, method: req.method, path: chemin + url.search, headers: entetes },
      (r) => {
        res.writeHead(r.statusCode ?? 502, { ...r.headers, ...cors });
        r.pipe(res);
      },
    );
    amont.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ message: `Service injoignable : ${e.message}` }));
    });
    req.pipe(amont);
  });
}

// ---------------------------------------------------------------------
// 3. Démarrage complet
// ---------------------------------------------------------------------
/**
 * Recrée la base du banc, démarre les services et renvoie leurs réglages.
 * @param {{ dureeJetons?: number, portPasserelle?: number }} [options]
 */
export async function demarrerBanc(options = {}) {
  const { binAuth, migrationsAuth, binRest, binNode, dossierStorage } = outils();
  const secret = randomBytes(32).toString("hex");
  const loin = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  const clePublique = signer({ iss: "supabase", ref: "banc", role: "anon", iat: 0, exp: loin }, secret);
  const cleService = signer({ iss: "supabase", ref: "banc", role: "service_role", iat: 0, exp: loin }, secret);

  // Base neuve
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${BASE}' and pid <> pg_backend_pid()`, "postgres");
  sql(`drop database if exists ${BASE}`, "postgres");
  sql(`create database ${BASE}`, "postgres");
  fichierSql(path.join(ICI, "preparation_avant_auth.sql"));

  const [portAuth, portRest, portStorage, portStorageAdmin] = [await portLibre(), await portLibre(), await portLibre(), await portLibre()];
  const portPasserelle = options.portPasserelle ?? (await portLibre());
  const url = `http://127.0.0.1:${portPasserelle}`;
  const dsn = (role) => `postgres://${role}@${PG.hote}:${PG.port}/${BASE}`;

  const journaux = path.join(ICI, ".journaux");
  mkdirSync(journaux, { recursive: true });

  const envAuth = {
    ...process.env,
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(portAuth),
    API_EXTERNAL_URL: `${url}/auth/v1`,
    GOTRUE_SITE_URL: "http://localhost:3000",
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `${dsn("supabase_auth_admin")}?search_path=auth`,
    GOTRUE_DB_MIGRATIONS_PATH: migrationsAuth,
    GOTRUE_DB_NAMESPACE: "auth",
    GOTRUE_JWT_SECRET: secret,
    GOTRUE_JWT_EXP: String(options.dureeJetons ?? 3600),
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DISABLE_SIGNUP: "true",            // comme le logiciel : seul l'admin crée les comptes
    GOTRUE_PASSWORD_MIN_LENGTH: "10",          // réglage à reprendre sur le projet Supabase (voir README)
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true",
    GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true",
    GOTRUE_RATE_LIMIT_HEADER: "X-Forwarded-For",
    // Les tests enchaînent des dizaines de connexions en quelques secondes depuis la même
    // adresse : sur le banc seulement, la limite anti-essais répétés est relevée.
    // (Sur Supabase, elle reste active : son message est testé à part.)
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "100000",
    GOTRUE_RATE_LIMIT_VERIFY: "100000",
    GOTRUE_MFA_RATE_LIMIT_CHALLENGE_AND_VERIFY: "100000",
    GOTRUE_LOG_LEVEL: "warn",
  };

  // Le VRAI service Auth crée son schéma (auth.users, auth.uid()…)
  executer(binAuth, ["migrate"], { env: envAuth });

  // Le VRAI service Storage crée son schéma (storage.buckets, storage.objects…)
  const fichiersStorage = mkdtempSync(path.join(os.tmpdir(), "banc-storage-"));
  const envStorage = {
    ...process.env,
    PATH: `${path.dirname(binNode)}:${process.env.PATH}`,
    // « production » forcerait des adresses https pour le téléversement reprenable :
    // le banc local est en http
    NODE_ENV: "development",
    REQUEST_ALLOW_X_FORWARDED_PATH: "true",
    SERVER_HOST: "127.0.0.1",
    SERVER_PORT: String(portStorage),
    SERVER_ADMIN_PORT: String(portStorageAdmin),
    DATABASE_URL: dsn("postgres"),
    DB_INSTALL_ROLES: "false",
    TENANT_ID: "banc",
    AUTH_JWT_SECRET: secret,
    AUTH_JWT_ALGORITHM: "HS256",
    ANON_KEY: clePublique,
    SERVICE_KEY: cleService,
    STORAGE_BACKEND: "file",
    STORAGE_FILE_BACKEND_PATH: fichiersStorage,
    UPLOAD_FILE_SIZE_LIMIT: String(50 * 1024 * 1024),
    TUS_URL_PATH: "/upload/resumable",
    LOG_LEVEL: "warn",
  };
  executer(binNode, [path.join(dossierStorage, "dist/scripts/migrate-call.js")], { env: envStorage, cwd: dossierStorage });
  fichierSql(path.join(ICI, "preparation_apres_auth.sql"));

  // Les migrations du logiciel, dans l'ordre
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    fichierSql(path.join(MIGRATIONS, f));
  }

  const processus = [];
  const lancer = (bin, args, env, nom, cwd = undefined) => {
    const sortie = openSync(path.join(journaux, `${nom}.log`), "w");
    const p = spawn(bin, args, { env, cwd, stdio: ["ignore", sortie, sortie] });
    processus.push(p);
    return p;
  };

  lancer(binAuth, ["serve"], envAuth, "auth");
  lancer(binRest, [], {
    ...process.env,
    PGRST_DB_URI: dsn("authenticator"),
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: secret,
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_SERVER_PORT: String(portRest),
    PGRST_LOG_LEVEL: "warn",
  }, "postgrest");
  lancer(binNode, [path.join(dossierStorage, "dist/start/server.js")], envStorage, "storage", dossierStorage);

  const serveur = passerelle({ portAuth, portRest, portStorage, clesValides: [clePublique, cleService] });
  await new Promise((r) => serveur.listen(portPasserelle, "127.0.0.1", r));

  try {
    await attendre(`http://127.0.0.1:${portAuth}/health`, "Le service Auth");
    await attendre(`http://127.0.0.1:${portRest}/`, "PostgREST");
    await attendre(`http://127.0.0.1:${portStorage}/status`, "Le service Storage", 60000);
  } catch (e) {
    await arreter();
    throw new Error(`${e.message} Voir ${journaux}.`);
  }

  async function arreter() {
    for (const p of processus) p.kill("SIGTERM");
    await new Promise((r) => serveur.close(() => r()));
    rmSync(fichiersStorage, { recursive: true, force: true });
  }

  return { url, clePublique, cleService, secret, base: BASE, sql, arreter };
}

// ---------------------------------------------------------------------
// Lancement direct : node tests/banc/banc.mjs
// ---------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.env.BANC_PORT ? Number(process.env.BANC_PORT) : 54321;
  const banc = await demarrerBanc({ portPasserelle: port });
  console.log("Banc d'essai Supabase prêt.");
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${banc.url}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${banc.clePublique}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY=${banc.cleService}`);
  const fin = async () => {
    await banc.arreter();
    process.exit(0);
  };
  process.on("SIGINT", fin);
  process.on("SIGTERM", fin);
}
