import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./model.ts";
import { langOf } from "./scan.ts";

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function loadConfig(): Config {
  return JSON.parse(
    readFileSync(join(repoRoot, "scripts/comments/config.json"), "utf8"),
  );
}

export function git(args: readonly string[], cwd = repoRoot): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
}

function nulList(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

export function excludedBy(file: string, config: Config): string | null {
  const parts = file.split("/");
  const dir = parts
    .slice(0, -1)
    .find((part) => config.excludedDirNames.includes(part));
  if (dir) return `${dir}/ directory`;
  const entry = config.excluded.find((rule) => file.startsWith(rule.path));
  return entry ? entry.reason : null;
}

export function inScope(file: string, config: Config): boolean {
  return langOf(file) !== null && excludedBy(file, config) === null;
}

export function underPrefixes(
  file: string,
  prefixes: readonly string[],
): boolean {
  if (prefixes.length === 0) return true;
  return prefixes.some((raw) => {
    const prefix = raw.replace(/^\.\//, "").replace(/\/+$/, "");
    return (
      prefix === "" ||
      prefix === "." ||
      file === prefix ||
      file.startsWith(`${prefix}/`)
    );
  });
}

export function scopedFiles(
  config: Config,
  prefixes: readonly string[] = [],
  root = repoRoot,
): string[] {
  const list = (args: string[]): string[] =>
    nulList(git(["ls-files", "-z", ...args], root));
  const ignored = new Set(list(["-ci", "--exclude-standard"]));
  const tracked = list([]).filter((file) => !ignored.has(file));
  const untracked = list(["--others", "--exclude-standard"]);
  return [...new Set([...tracked, ...untracked])]
    .filter((file) => inScope(file, config) && underPrefixes(file, prefixes))
    .filter((file) => existsSync(join(root, file)))
    .sort();
}

export function readRepoFile(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8");
}
