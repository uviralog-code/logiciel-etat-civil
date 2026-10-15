import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // « server-only » protège le code serveur dans Next.js ; dans les tests, il est neutralisé
    alias: { "server-only": fileURLToPath(new URL("./src/test/vide.ts", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/preparation.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Les tests « banc » ont leur propre commande (npm run test:banc)
    exclude: ["**/node_modules/**", "src/**/*.banc.test.{ts,tsx}"],
  },
});
