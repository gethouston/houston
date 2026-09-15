import { extractCatalog } from "./assistant-extractor.ts";
import { coverageViolations, formatViolations } from "./assistant-gate.ts";
import { assistantPaths } from "./assistant-paths.ts";

/**
 * The build gate. A user-facing adapter operation is a properly annotated,
 * routable assistant tool, or it carries a written acknowledgement of why it is
 * not — the drift check only proves the generated files match the source, so
 * without this an operation can fall out of automation and nothing fails.
 */
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
