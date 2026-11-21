import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

export function readSources(dir) {
  return sourceFiles(dir).map((path) => ({
    path,
    src: stripComments(readFileSync(path, "utf8")),
  }));
}
