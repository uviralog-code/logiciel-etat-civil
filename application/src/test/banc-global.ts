import type { TestProject } from "vitest/node";
import { demarrerBanc } from "../../../tests/banc/banc.mjs";

export interface ReglagesBanc {
  url: string;
  clePublique: string;
  cleService: string;
  secret: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    banc: ReglagesBanc;
  }
}

/** Démarre le banc d'essai Supabase une fois pour tous les tests « banc », puis l'arrête. */
export default async function preparer(projet: TestProject) {
  const banc = await demarrerBanc();
  projet.provide("banc", {
    url: banc.url,
    clePublique: banc.clePublique,
    cleService: banc.cleService,
    secret: banc.secret,
  });
  return () => banc.arreter();
}
