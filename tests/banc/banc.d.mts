// Types du banc d'essai (banc.mjs), pour les tests écrits en TypeScript.
export declare const VERSIONS: { auth: string; postgrest: string; storage: string; node: string };

export interface Banc {
  /** Adresse du « projet Supabase » local (passerelle /auth/v1, /rest/v1 et /storage/v1). */
  url: string;
  clePublique: string;
  cleService: string;
  /** Secret de signature des jetons (sert à fabriquer un jeton expiré dans les tests). */
  secret: string;
  base: string;
  sql(requete: string, base?: string): string;
  arreter(): Promise<void>;
}

export declare function demarrerBanc(options?: { dureeJetons?: number; portPasserelle?: number }): Promise<Banc>;
export declare function sql(requete: string, base?: string): string;
export declare function signer(charge: Record<string, unknown>, secret: string): string;
