import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractCatalog } from "./assistant-extractor.ts";
import { assistantPaths } from "./assistant-paths.ts";
import {
  renderCapabilities,
  renderCatalog,
  renderCoverage,
} from "./assistant-render.ts";

export function generateAssistantCatalog(
  outputDirectory = assistantPaths.generated,
): void {
  const result = extractCatalog({
    operationSources: assistantPaths.operationSources,
    transportSource: assistantPaths.transportSource,
  });
  mkdirSync(outputDirectory, { recursive: true });
  const catalog = execFileSync(
    assistantPaths.biome,
    ["format", "--stdin-file-path", "assistant-catalog.json"],
    {
      cwd: assistantPaths.repo,
      encoding: "utf8",
      input: renderCatalog(result.catalog),
    },
  );
  writeFileSync(join(outputDirectory, "assistant-catalog.json"), catalog);
  writeFileSync(
    join(outputDirectory, "assistant-capabilities.md"),
    renderCapabilities(result.catalog),
  );
  writeFileSync(
    join(outputDirectory, "assistant-coverage.md"),
    renderCoverage(result),
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  generateAssistantCatalog(process.argv[2]);
}
