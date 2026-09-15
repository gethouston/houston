/**
 * Reading `app/src` the way a boundary check has to: every shipped source, with
 * comments blanked out.
 *
 * A check that greps raw source finds its own pattern inside prose — the doc
 * comment in `sentry-reported-mark.ts` says `invoke("report_bug")` to explain
 * the boundary, and a naive `invoke(` scan reports it as a violation of that
 * very boundary. Blanking comments first is what makes such a check safe to
 * state as an absolute.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Source with `//` and block comments replaced by spaces, string and template
 * literals respected so a `//` inside one survives. Newlines are kept, so a
 * match still falls on its original line.
 *
 * TypeScript only: every `'` is a string quote here. Do NOT point this at Rust,
 * where `'a` is a lifetime.
 */
export function stripComments(src) {
  let out = "";
  let quote = null;
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") out += src[++i] ?? "";
      else if (c === quote) quote = null;
      i++;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
    } else if (c === "/" && (d === "/" || d === "*")) {
      const end =
        d === "/"
          ? src.indexOf("\n", i) + 1 || src.length
          : src.indexOf("*/", i + 2) + 2 || src.length;
      out += src.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Every shipped `.ts`/`.tsx` under `dir`, at any depth. Tests are not shipped. */
export function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry))
      out.push(full);
  }
  return out;
}

/** `{ path, src }` per shipped source, comments blanked. */
export function readSources(dir) {
  return sourceFiles(dir).map((path) => ({
    path,
    src: stripComments(readFileSync(path, "utf8")),
  }));
}
