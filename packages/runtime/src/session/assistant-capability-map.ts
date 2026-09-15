import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { renderAssistantCapabilityIndex } from "@houston/domain/assistant-capability-index-render";
import { readUnservedOperations } from "@houston/domain/assistant-deployment";
import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";

/**
 * The coordinator's map of what it can do HERE.
 *
 * The generated index (`@houston/domain/assistant-capability-index`) describes
 * one surface that desktop and hosted cloud share, and a desktop serves only
 * part of it: spaces, teams, billing and the hosted profile exist behind the
 * gateway alone. Carrying the whole list into a desktop coordinator's prompt is
 * what has it offer the user a space it cannot create, then report an error it
 * cannot explain.
 *
 * The host is what knows the answer — it derives it from its own route table
 * and stamps it at spawn (`@houston/domain/assistant-deployment`). This reads
 * that stamp and renders the map over what is left, with the SAME renderer the
 * generator used, so the two forms of the map can never word themselves
 * differently.
 *
 * Nothing stamped means nothing withheld, and then the generated constant IS
 * the answer — returned untouched, so the ordinary case costs no catalog read
 * and no render. A build whose embedded catalog will not parse falls back the
 * same way: a coordinator that knows too much is a wrong sentence, while one
 * that knows nothing is a product with no assistant in it.
 */
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
