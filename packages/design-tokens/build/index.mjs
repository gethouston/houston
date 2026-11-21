import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./collect.mjs";
import { buildCss } from "./css.mjs";
import { buildPalettes } from "./palette.mjs";
import { buildTs } from "./ts.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const OUT = process.env.OUT_DIR ? process.env.OUT_DIR : join(ROOT, "dist");

export async function build() {
  const light = await collect("light");
  const dark = await collect("dark");
  const palettes = buildPalettes(light, dark);
  return {
    files: {
      "css/tokens.css": buildCss(light, dark, palettes),
      "ts/tokens.ts": buildTs(light, dark, palettes),
    },
    notes: palettes.flatMap((palette) => palette.notes),
  };
}

async function main() {
  const { files, notes } = await build();
  for (const note of notes) process.stdout.write(`  note ${note}\n`);
  for (const [rel, content] of Object.entries(files)) {
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    process.stdout.write(`  wrote ${rel}\n`);
  }
  process.stdout.write(`design tokens built -> ${OUT}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}
