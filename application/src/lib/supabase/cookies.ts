import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Options des cookies de session.
 *
 * « Secure » interdit au navigateur d'envoyer le cookie sur une connexion non
 * chiffrée. Il est activé dès que l'application est servie en https (cas d'un
 * hébergement en ligne). Il ne peut pas l'être en http, sinon la connexion
 * deviendrait impossible sur un serveur local de commune sans https.
 */
export function optionsCookies(protocole: string | null | undefined): CookieOptionsWithName {
  const enHttps = (protocole ?? "").replace(/:$/, "").toLowerCase() === "https";
  return { path: "/", sameSite: "lax", secure: enHttps };
}
