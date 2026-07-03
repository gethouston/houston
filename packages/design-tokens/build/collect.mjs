import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

// The package root (parent of build/), so source globs resolve no matter what
// cwd the build is invoked from (pnpm filter, the sync test, CI).
const ROOT = fileURLToPath(new URL("..", import.meta.url));

const FLAT_FORMAT = "houston/flat-json";
let registered = false;

function register() {
  if (registered) return;
  StyleDictionary.registerFormat({
    name: FLAT_FORMAT,
    // Emit the fully resolved DTCG tokens verbatim. No value transforms run, so
    // `$value` keeps the exact author string (references already resolved) — the
    // basis of the zero-diff guarantee.
    format: ({ dictionary }) =>
      JSON.stringify(
        dictionary.allTokens.map((t) => ({
          path: t.path,
          value: t.$value,
          type: t.$type ?? t.type,
          filePath: t.filePath,
        })),
      ),
  });
  registered = true;
}

/**
 * Resolve every token for one theme through Style Dictionary and return the
 * non-primitive tokens (semantic colours + theme-independent scales). Primitives
 * exist only to be referenced, never emitted.
 *
 * @param {"light" | "dark"} theme
 */
export async function collect(theme) {
  register();
  const out = mkdtempSync(join(tmpdir(), "houston-tokens-"));
  try {
    const sd = new StyleDictionary({
      source: [
        join(ROOT, "tokens/primitive/**/*.json"),
        join(ROOT, "tokens/scale/**/*.json"),
        join(ROOT, `tokens/semantic/color.${theme}.json`),
      ],
      platforms: {
        flat: {
          transforms: [],
          buildPath: `${out}/`,
          files: [{ destination: "flat.json", format: FLAT_FORMAT }],
        },
      },
      log: { verbosity: "silent", warnings: "disabled" },
    });
    await sd.buildAllPlatforms();
    const tokens = JSON.parse(readFileSync(join(out, "flat.json"), "utf8"));
    return tokens.filter((t) => !t.filePath.includes("/primitive/"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
