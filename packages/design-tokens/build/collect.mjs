import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

// The package root (parent of build/), so source globs resolve no matter what
// cwd the build is invoked from (pnpm filter, the sync test, CI).
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Join path segments into a Style Dictionary `source` glob with POSIX separators.
 *
 * Style Dictionary globs `source` with fast-glob, which requires forward-slash
 * separators on EVERY platform. `node:path.join` emits BACKSLASHES on Windows,
 * and fast-glob reads a backslash as an escape character — so a Windows-joined
 * glob (`C:\…\tokens\primitive\**\*.json`) silently matches nothing, the
 * primitive/scale token files never load, and every cross-file reference fails
 * ("Some token references could not be found"). This broke both windows-msvc
 * release jobs at `pnpm install` (the design-tokens `prepare` build). Join for
 * correct resolution, then force forward slashes. No-op on macOS/Linux.
 */
export const posixGlob = (...segments) =>
  join(...segments).replaceAll("\\", "/");

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
        posixGlob(ROOT, "tokens/primitive/**/*.json"),
        posixGlob(ROOT, "tokens/scale/**/*.json"),
        posixGlob(ROOT, `tokens/semantic/color.${theme}.json`),
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
    // fast-glob returns forward-slash filePaths, but normalise defensively so the
    // primitive filter can't silently misfire on Windows (which would leak
    // primitives into the emitted tokens instead of failing loudly).
    return tokens.filter(
      (t) => !t.filePath.replaceAll("\\", "/").includes("/primitive/"),
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}
