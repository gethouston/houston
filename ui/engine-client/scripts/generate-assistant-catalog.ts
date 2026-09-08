import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractCatalog } from "./assistant-extractor.ts";
import { assistantOutputs, assistantPaths } from "./assistant-paths.ts";
import {
  renderCapabilities,
  renderCapabilityIndex,
  renderCatalog,
  renderCoverage,
  renderOperations,
} from "./assistant-render.ts";

/** The generated file names, so a missing body is a compile error. */
type AssistantOutputFile = (typeof assistantOutputs)[number]["file"];

/**
 * Run one generated body through the repo's own formatter, so a committed
 * output is byte-identical to what `pnpm check` would rewrite it to — without
 * this the drift check and the formatter disagree forever.
 */
function format(file: AssistantOutputFile, body: string): string {
  return execFileSync(
    assistantPaths.biome,
    ["format", "--stdin-file-path", file],
    {
      cwd: assistantPaths.repo,
      encoding: "utf8",
      input: body,
    },
  );
}

/**
 * Write every generated output. Each file goes to its committed home; passing
 * `outputDirectory` collapses them into one directory, which is how the drift
 * check regenerates into a temporary tree and compares.
 */
export function generateAssistantCatalog(outputDirectory?: string): void {
  const result = extractCatalog({
    operationSources: assistantPaths.operationSources,
    transportSource: assistantPaths.transportSource,
  });
  const bodies: Record<AssistantOutputFile, string> = {
    "assistant-catalog.generated.json": format(
      "assistant-catalog.generated.json",
      renderCatalog(result.catalog),
    ),
    "assistant-capability-index.generated.ts": format(
      "assistant-capability-index.generated.ts",
      renderCapabilityIndex(result.catalog),
    ),
    "assistant-capabilities.md": renderCapabilities(result.catalog),
    "assistant-coverage.md": renderCoverage(result),
    "assistant-operations.md": renderOperations(result.catalog),
  };
  for (const { file, directory } of assistantOutputs) {
    const target = outputDirectory ?? directory;
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, file), bodies[file]);
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  generateAssistantCatalog(process.argv[2]);
}
