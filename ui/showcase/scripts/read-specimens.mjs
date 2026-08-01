/**
 * The specimen contract, read out of source text: every page's `id` and the
 * `@houston-ai/*` symbols it declares in `export const sources: string[]`.
 *
 * Read rather than imported so the generator stays a plain Node script with no
 * TypeScript loader — and so a page that forgets `sources` THROWS here instead
 * of quietly reporting that nothing uses it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHOWCASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SHOWCASE, "../..");

/** Every specimen module under `specimens/`, sorted so output is stable. */
function specimenFiles() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : 1),
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && entry.name !== "index.ts")
        found.push(path);
    }
  };
  walk(join(SHOWCASE, "specimens"));
  return found;
}

/** `{ id, sources, file }` for every specimen page. */
export function readSpecimens() {
  const specimens = [];
  for (const path of specimenFiles()) {
    const source = readFileSync(path, "utf8");
    if (!/^export const specimen: Specimen = \{/m.test(source)) continue;
    const where = relative(REPO, path);
    const id =
      /^export const specimen: Specimen = \{\s*\n\s*id: "([^"]+)"/m.exec(
        source,
      );
    if (!id) throw new Error(`${where}: cannot read the specimen id`);
    const block = /^export const sources: string\[\] = \[([\s\S]*?)\];/m.exec(
      source,
    );
    if (!block)
      throw new Error(
        `${where}: no \`export const sources: string[]\` — every specimen names the @houston-ai symbols it documents`,
      );
    const symbols = [...block[1].matchAll(/"([^"]+)"/g)].map((one) => one[1]);
    // A Foundations page documents the design system itself — the palette, the
    // canvas effects — not a `@houston-ai/*` export, so it has no symbols to
    // name and no "Used in" row to build. Every other page still must.
    if (symbols.length === 0 && !id[1].startsWith("foundations-"))
      throw new Error(`${where}: \`sources\` is empty`);
    specimens.push({ id: id[1], sources: symbols, file: where });
  }
  return specimens;
}
