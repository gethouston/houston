import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * vite's dep optimizer pre-bundles ONE copy per bare specifier for the whole
 * browser graph. If two workspace packages declare different zod majors, every
 * importer of `zod` gets whichever copy the optimizer met first — a zod 3
 * bundle handed to `@houston/protocol` (zod 4 API: `z.uuid()`) throws at module
 * evaluation and the app never mounts. Every workspace package must therefore
 * declare the identical zod specifier.
 */
const repoRoot = path.resolve(__dirname, "../../..");
const WORKSPACE_PARENTS = ["packages", "ui"];
const WORKSPACE_SINGLES = ["app", "agentstore"];

function workspaceDirs(): string[] {
  const nested = WORKSPACE_PARENTS.flatMap((parent) =>
    readdirSync(path.join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name)),
  );
  return [...nested, ...WORKSPACE_SINGLES].filter((dir) =>
    existsSync(path.join(repoRoot, dir, "package.json")),
  );
}

function zodSpecifiers(): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of workspaceDirs()) {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, dir, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      const specifier = manifest[field]?.zod;
      if (specifier) found.set(`${dir} (${field})`, specifier);
    }
  }
  return found;
}

describe("workspace zod", () => {
  it("is declared by at least the protocol package", () => {
    expect(
      zodSpecifiers().get("packages/protocol (dependencies)"),
    ).toBeTruthy();
  });

  it("uses one identical specifier in every workspace package", () => {
    const specifiers = zodSpecifiers();
    const protocol = specifiers.get("packages/protocol (dependencies)");
    const mismatched = [...specifiers].filter(([, spec]) => spec !== protocol);
    expect(mismatched).toEqual([]);
  });
});
