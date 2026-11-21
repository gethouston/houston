import { deepStrictEqual } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const SRC = join(import.meta.dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function leafStrings(value: unknown, path: string, out: [string, string][]) {
  if (typeof value === "string") out.push([path, value]);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      leafStrings(v, `${path}.${k}`, out);
  }
}

describe("toast copy never interpolates a raw error", () => {
  it("no locale string carries {{error}}", () => {
    const offenders: string[] = [];
    const localesDir = join(SRC, "locales");
    for (const file of walk(localesDir).filter((f) => f.endsWith(".json"))) {
      const leaves: [string, string][] = [];
      leafStrings(
        JSON.parse(readFileSync(file, "utf8")),
        relative(localesDir, file),
        leaves,
      );
      for (const [path, text] of leaves) {
        if (/\{\{\s*error\s*\}\}/.test(text)) offenders.push(path);
      }
    }
    deepStrictEqual(offenders, []);
  });

  it("no t() call in app/src passes an `error:` variable", () => {
    const interpolatedError =
      /\bt\(\s*["'`][^"'`]*["'`]\s*,\s*\{[^}]*\berror\s*:/g;
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (!/\.(ts|tsx)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      if (interpolatedError.test(source)) offenders.push(relative(SRC, file));
      interpolatedError.lastIndex = 0;
    }
    deepStrictEqual(offenders, []);
  });
});
