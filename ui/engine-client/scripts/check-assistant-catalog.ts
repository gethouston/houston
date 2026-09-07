import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistantPaths } from "./assistant-paths.ts";
import { generateAssistantCatalog } from "./generate-assistant-catalog.ts";

const files = [
  "assistant-catalog.json",
  "assistant-capabilities.md",
  "assistant-coverage.md",
];
const temporary = mkdtempSync(join(tmpdir(), "houston-assistant-catalog-"));
let drifted = false;
try {
  generateAssistantCatalog(temporary);
  for (const file of files) {
    const expected = readFileSync(join(assistantPaths.generated, file));
    const actual = readFileSync(join(temporary, file));
    if (!expected.equals(actual)) {
      drifted = true;
      process.stderr.write(`Assistant catalog drift detected in ${file}.\n`);
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
if (drifted) {
  process.stderr.write(
    "Run pnpm gen:assistant-catalog and commit the generated outputs.\n",
  );
  process.exitCode = 1;
}
