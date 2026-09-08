import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistantOutputs, repoRelative } from "./assistant-paths.ts";
import { generateAssistantCatalog } from "./generate-assistant-catalog.ts";

const temporary = mkdtempSync(join(tmpdir(), "houston-assistant-catalog-"));
let drifted = false;
try {
  generateAssistantCatalog(temporary);
  for (const { file, directory } of assistantOutputs) {
    const committed = join(directory, file);
    const expected = readFileSync(committed);
    const actual = readFileSync(join(temporary, file));
    if (!expected.equals(actual)) {
      drifted = true;
      process.stderr.write(
        `Assistant catalog drift detected in ${repoRelative(committed)}.\n`,
      );
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
