import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { renderAssistantCapabilityIndex } from "@houston/domain/assistant-capability-index-render";
import { readUnservedOperations } from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";

// WHY: Host and runtime can be a release apart; ignore unserved names not in the catalog. ADR-0014
export function assistantCapabilityMap(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const unserved = readUnservedOperations(env);
  if (unserved.size === 0) return ASSISTANT_CAPABILITY_INDEX;
  const catalog = processAssistantCatalog();
  if (!catalog) return ASSISTANT_CAPABILITY_INDEX;
  return renderAssistantCapabilityIndex(
    catalog.operations.filter((op) => !unserved.has(op.name)),
  );
}
