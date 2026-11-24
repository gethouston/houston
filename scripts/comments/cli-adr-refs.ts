import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkAdr, type RepoView } from "./adr-refs.ts";
import { git, loadConfig, repoRoot } from "./files.ts";

const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const files = new Set(tracked);
const dirs = new Set<string>();
for (const file of tracked) {
  const parts = file.split("/");
  for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
}
const roots = new Set(
  [...dirs]
    .filter((dir) => !dir.includes("/") && dir !== ".houston")
    .concat([...files]),
);
const sources = new Map<string, string>();

const retired = new Set(loadConfig().retiredPaths.map((entry) => entry.path));

const repo: RepoView = {
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
      ? readFileSync(join(repoRoot, path), "utf8")
      : tracked
          .filter((file) => file.startsWith(`${path}/`))
          .filter((file) => statSync(join(repoRoot, file)).size < 1 << 20)
          .map((file) => readFileSync(join(repoRoot, file), "utf8"))
          .join("\n");
    sources.set(path, text);
    return text;
  },
};

const adrDir = join(repoRoot, "docs/adr");
let count = 0;
for (const name of readdirSync(adrDir).sort()) {
  if (!name.endsWith(".md")) continue;
  const problems = checkAdr(readFileSync(join(adrDir, name), "utf8"), repo);
  for (const { line, message } of problems)
    console.error(`docs/adr/${name}:${line}: ${message}`);
  count += problems.length;
}
if (count > 0) {
  console.error(
    `check:adr-refs failed: ${count} stale file or symbol references. Point each at the current file and symbol.`,
  );
  process.exitCode = 1;
} else console.log("check:adr-refs OK.");
