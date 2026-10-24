// Every lesson ships in English and Spanish, or not at all. English pages live at the root of
// src/content/docs, Spanish ones under src/content/docs/es with the same path.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src/content/docs/", import.meta.url).pathname;
const esRoot = join(root, "es");

function pages(dir, skip) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path === skip) return [];
    if (statSync(path).isDirectory()) return pages(path, skip);
    return /\.(md|mdx)$/.test(name)
      ? [relative(dir === root ? root : root, path)]
      : [];
  });
}

const en = new Set(pages(root, esRoot));
const es = new Set(pages(esRoot).map((p) => relative("es", p)));
const missingEs = [...en].filter((p) => !es.has(p));
const missingEn = [...es].filter((p) => !en.has(p));

if (missingEs.length || missingEn.length) {
  for (const p of missingEs) console.error(`missing Spanish version: es/${p}`);
  for (const p of missingEn) console.error(`missing English version: ${p}`);
  process.exit(1);
}
console.log(`locales ok: ${en.size} pages in English and Spanish`);
