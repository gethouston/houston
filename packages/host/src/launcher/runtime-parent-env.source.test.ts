import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  HOST_ONLY,
  RUNTIME_PASS_THROUGH,
  runtimeParentEnv,
} from "./runtime-parent-env";

const HOST_SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DOMAIN_SRC = resolve(HOST_SRC, "../../domain/src");

const SRC_ROOTS = [HOST_SRC, DOMAIN_SRC];

const PACKAGES_ROOT = resolve(HOST_SRC, "../..");

const NAME_PATTERN =
  /(?:process\.env\.|process\.env\[\s*"|")((?:HOUSTON|COMPOSIO)_[A-Z0-9_]+)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

function hostEnvironmentNames(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of SRC_ROOTS.flatMap(sourceFiles)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(NAME_PATTERN)) {
      const name = match[1];
      if (!name) continue;
      const files = found.get(name) ?? [];
      files.push(relative(PACKAGES_ROOT, file));
      found.set(name, files);
    }
  }
  return found;
}

test("every HOUSTON_/COMPOSIO_ name the host reads is classified", () => {
  const unclassified = [...hostEnvironmentNames()]
    .filter(([name]) => !HOST_ONLY.has(name) && !RUNTIME_PASS_THROUGH.has(name))
    .map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
  expect(unclassified).toEqual([]);
});

test("a name is withheld or shared, never both", () => {
  const both = [...HOST_ONLY].filter((name) => RUNTIME_PASS_THROUGH.has(name));
  expect(both).toEqual([]);
});

test("the classification is what the child env actually gets", () => {
  const parent: NodeJS.ProcessEnv = {
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "sk-provider",
  };
  for (const name of [...HOST_ONLY, ...RUNTIME_PASS_THROUGH])
    parent[name] = `value-of-${name}`;
  const child = runtimeParentEnv(parent);
  for (const name of HOST_ONLY) expect(child[name]).toBeUndefined();
  for (const name of RUNTIME_PASS_THROUGH)
    expect(child[name]).toBe(`value-of-${name}`);
  expect(child.PATH).toBe("/usr/bin");
  expect(child.ANTHROPIC_API_KEY).toBe("sk-provider");
});
