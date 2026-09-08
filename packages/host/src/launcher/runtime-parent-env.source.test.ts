import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  HOST_ONLY,
  RUNTIME_PASS_THROUGH,
  runtimeParentEnv,
} from "./runtime-parent-env";

/**
 * THE GUARD THE DENYLIST NEEDS.
 *
 * `runtimeParentEnv` strips a listed set, so a Houston variable nobody thought
 * about is INHERITED by every runtime this host spawns — a model-directed
 * process — and the next host-only credential added anywhere in this package
 * would reach it silently. The runtime's own needs cannot be enumerated from
 * here (provider keys, proxy/certificate variables, PATH, locale), so the
 * allowlist that would replace the denylist is not writable; what IS
 * enumerable is every `HOUSTON_*` / `COMPOSIO_*` name this package reads.
 *
 * This scans the host sources for those names and requires each to be
 * classified exactly once: withheld (HOST_ONLY) or deliberately shared
 * (RUNTIME_PASS_THROUGH). A new variable fails here until somebody decides.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `process.env.NAME`, `process.env["NAME"]`, and any double-quoted Houston /
 * Composio name — which is how the names read through a constant reach the
 * scan (`process.env[ASSISTANT_USER_ID_ENV]`, `optionalPositiveNumber("…")`).
 */
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

/** Every host-read environment name, with the files that mention it. */
function hostEnvironmentNames(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(SRC_ROOT)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(NAME_PATTERN)) {
      const name = match[1];
      if (!name) continue;
      const files = found.get(name) ?? [];
      files.push(relative(SRC_ROOT, file));
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
  // The unenumerable half the denylist exists to preserve.
  expect(child.PATH).toBe("/usr/bin");
  expect(child.ANTHROPIC_API_KEY).toBe("sk-provider");
});
