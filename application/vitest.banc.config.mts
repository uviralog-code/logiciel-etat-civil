import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Tests « banc » : exécutés contre le banc d'essai Supabase local
 * (vrai service de connexion, vrai accès aux données, vrai stockage des
 * fichiers, vraie base avec toutes ses migrations). Commande : npm run test:banc
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./src/test/vide.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.banc.test.{ts,tsx}"],
    globalSetup: ["./src/test/banc-global.ts"],
    // Les tests partagent la même base : ils passent l'un après l'autre
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 120000,
  },
});
