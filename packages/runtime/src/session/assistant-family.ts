import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { config } from "../config";
import { sandboxCall } from "./sandbox-call";
import { makeAssistantTools } from "./tools/assistant";

/**
 * The assistant tool family (`houston_capabilities` / `houston_describe` /
 * `houston_call` / `houston_recall`): the runtime performing user-facing
 * Houston operations on the user's own account.
 *
 * Three gates, all required. This runtime IS the coordinator and can reach its
 * host (both folded into `config.assistantEnabled`, so the runtime and the
 * host's dispatcher can never disagree about who may perform operations), and
 * this build's embedded operation catalog is readable. An unreadable catalog is
 * a named log line and no tools, never a boot failure — the family is the one
 * thing an assistant cannot fake, so it is better absent than half-present.
 */

const catalog =
  config.assistantEnabled && sandboxCall ? processAssistantCatalog() : null;

/** What both backends build the family from, or undefined when it is off. */
export const assistantOptions =
  catalog && sandboxCall ? { catalog, call: sandboxCall } : undefined;

/** The family's tool objects for the pi backend; empty when the family is off. */
export const assistantTools = assistantOptions
  ? makeAssistantTools(assistantOptions)
  : [];
