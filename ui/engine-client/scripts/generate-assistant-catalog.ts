import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractCatalog } from "./assistant-extractor.ts";
import { assistantOutputs, assistantPaths } from "./assistant-paths.ts";
import {
  renderCapabilities,
  renderCatalog,
  renderCoverage,
} from "./assistant-render.ts";

/** The generated file names, so a missing body is a compile error. */
type AssistantOutputFile = (typeof assistantOutputs)[number]["file"];

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
    "assistant-catalog.generated.json": execFileSync(
      assistantPaths.biome,
      ["format", "--stdin-file-path", "assistant-catalog.generated.json"],
      {
        cwd: assistantPaths.repo,
        encoding: "utf8",
        input: renderCatalog(result.catalog),
      },
    ),
    "assistant-capabilities.md": renderCapabilities(result.catalog),
    "assistant-coverage.md": renderCoverage(result),
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
