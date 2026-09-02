import { deepStrictEqual } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

// A toast is authored product copy, never a raw diagnostic. Before this guard,
// six locale keys carried `{{error}}` and their catch blocks filled it with
// `String(err)`, so a Stop on a cold pod read "Couldn't stop the task:
// EngineError: engine request failed (502): {"detail":"Post \"http://agent-…
// .svc.cluster.local:4318/…\": dial tcp: lookup … no such host"}": class
// names, HTTP statuses, JSON, and cluster hostnames in a red box for a
// non-technical user. The raw error belongs to the reporting paths
// (`logAndReportError` / `showErrorToast`), which every rewritten catch still
// calls. Two source-level checks keep the shape from coming back:
//  - no locale string interpolates `{{error}}` (in any language, so a
//    translation can't reintroduce it either);
//  - no `t(...)` / `i18n.t(...)` call in app/src passes an `error:` variable.

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
    // Matches `t("ns:key", { error: ... })` and `i18n.t("key", {\n error: ...`
    // across lines; `[^}]*` keeps the scan inside the options object.
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
