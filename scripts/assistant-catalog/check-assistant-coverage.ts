import { extractCatalog } from "./assistant-extractor.ts";
import { coverageViolations, formatViolations } from "./assistant-gate.ts";
import { assistantPaths } from "./assistant-paths.ts";

const violations = coverageViolations(
  extractCatalog({
    operationSources: assistantPaths.operationSources,
    isModuleSource: assistantPaths.isModuleSource,
    transportSource: assistantPaths.transportSource,
    facadeSource: assistantPaths.facadeSource,
    resolverSources: assistantPaths.resolverSources,
  }).annotations,
);
if (violations.length > 0) {
  process.stderr.write(formatViolations(violations));
  process.exitCode = 1;
}
