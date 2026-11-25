import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RepoView } from "./adr-mentions.ts";
import { git } from "./files.ts";

export function workingTreeFiles(root: string): string[] {
  return git(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    root,
  )
    .split("\0")
    .filter((file) => file !== "" && existsSync(join(root, file)));
}

function codeWords(root: string, list: readonly string[]): Set<string> {
  const words = new Set<string>();
  for (const file of list) {
    if (file.endsWith(".md") || statSync(join(root, file)).size >= 1 << 20)
      continue;
    const text = readFileSync(join(root, file), "utf8");
    if (text.includes("\0")) continue;
    for (const [word] of text.matchAll(/[A-Za-z_][\w]*/g)) words.add(word);
  }
  return words;
}

export function workingTreeRepo(
  root: string,
  retired: ReadonlySet<string>,
): RepoView {
  const list = workingTreeFiles(root);
  const files = new Set(list);
  const dirs = new Set<string>();
  for (const file of list) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i++)
      dirs.add(parts.slice(0, i).join("/"));
  }
  const roots = new Set(
    [...dirs]
      .filter((dir) => !dir.includes("/") && dir !== ".houston")
      .concat(list),
  );
  const sources = new Map<string, string>();
  let words: Set<string> | null = null;
  return {
    roots,
    retired,
    under: (dir, suffix) =>
      [...files, ...dirs].filter(
        (path) =>
          path.startsWith(`${dir}/`) &&
          (path === `${dir}/${suffix}` || path.endsWith(`/${suffix}`)),
      ),
    isFile: (path) => files.has(path),
    isDir: (path) => dirs.has(path),
    source(path) {
      const cached = sources.get(path);
      if (cached !== undefined) return cached;
      const text = files.has(path)
        ? readFileSync(join(root, path), "utf8")
        : list
            .filter((file) => file.startsWith(`${path}/`))
            .filter((file) => statSync(join(root, file)).size < 1 << 20)
            .map((file) => readFileSync(join(root, file), "utf8"))
            .join("\n");
      sources.set(path, text);
      return text;
    },
    inCode(word) {
      words ??= codeWords(root, list);
      return words.has(word);
    },
  };
}
