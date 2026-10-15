// Copie OpenCV.js (fichier 34) dans public/vendor/, sous un nom qui porte sa
// version : le navigateur peut alors le garder un an en cache (3,5 Mo une
// seule fois). Lancé automatiquement avant « next dev » et « next build ».
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_OPENCV = "4.12.0-release.1";
const ici = dirname(fileURLToPath(import.meta.url));
const paquet = join(ici, "../node_modules/@techstark/opencv-js");
const version = JSON.parse(readFileSync(join(paquet, "package.json"), "utf8")).version;
if (version !== VERSION_OPENCV) {
  throw new Error(`OpenCV.js installé : ${version}, attendu : ${VERSION_OPENCV}. Mettez à jour VERSION_OPENCV ici et dans src/lib/photo-navigateur.ts.`);
}
const source = join(paquet, "dist/opencv.js");
const cible = join(ici, `../public/vendor/opencv-${VERSION_OPENCV}.js`);
mkdirSync(dirname(cible), { recursive: true });
if (!existsSync(cible) || statSync(cible).size !== statSync(source).size) copyFileSync(source, cible);
