import { processAssistantCatalog } from "@houston/host/src/assistant/catalog-source";
import { config } from "../config";
import { sandboxCall } from "./sandbox-call";
import { makeAssistantTools } from "./tools/assistant";

const catalog =
  config.assistantEnabled && sandboxCall ? processAssistantCatalog() : null;

export const assistantOptions =
  catalog && sandboxCall ? { catalog, call: sandboxCall } : undefined;

export const assistantTools = assistantOptions
  ? makeAssistantTools(assistantOptions)
  : [];
