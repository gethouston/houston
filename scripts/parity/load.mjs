/**
 * Filesystem + YAML loading for the parity checker. Every loader is total: a
 * missing file or a parse error becomes a structured problem string rather than
 * a thrown exception, so the checker can report ALL problems in one run (the
 * same "collect, don't throw" shape as scripts/check-boundaries.mjs).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

/** Parse a YAML file. Returns { value } or { problem } (never throws). */
function loadYaml(path, label) {
  if (!existsSync(path))
    return { problem: `${label}: file not found (${path})` };
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return { problem: `${label}: unreadable (${err.message})` };
  }
  try {
    return { value: parse(text) };
  } catch (err) {
    return { problem: `${label}: invalid YAML (${err.message})` };
  }
}

/** Load design/inventory/inventory.yaml as a raw parsed object. */
export function loadInventory(dir) {
  return loadYaml(join(dir, "inventory.yaml"), "inventory.yaml");
}

/** Load the CHANGELOG.md text, or a problem if it is missing. */
export function loadChangelog(dir) {
  const path = join(dir, "CHANGELOG.md");
  if (!existsSync(path)) return { problem: "CHANGELOG.md: file not found" };
  try {
    return { value: readFileSync(path, "utf8") };
  } catch (err) {
    return { problem: `CHANGELOG.md: unreadable (${err.message})` };
  }
}

/**
 * Load every manifest under manifests/*.yaml. Returns an array of
 * { name, path, value?, problem? }, sorted by filename for stable reporting.
 * `name` is the filename base (the expected `surface` value).
 */
export function loadManifests(dir) {
  const manifestDir = join(dir, "manifests");
  if (!existsSync(manifestDir)) {
    return [
      {
        name: "manifests",
        path: manifestDir,
        problem: "manifests/: directory not found",
      },
    ];
  }
  const files = readdirSync(manifestDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  if (files.length === 0) {
    return [
      {
        name: "manifests",
        path: manifestDir,
        problem: "manifests/: no *.yaml manifests found",
      },
    ];
  }
  return files.map((file) => {
    const path = join(manifestDir, file);
    const name = basename(file).replace(/\.ya?ml$/, "");
    const parsed = loadYaml(path, `manifests/${file}`);
    return { name, path, label: `manifests/${file}`, ...parsed };
  });
}
