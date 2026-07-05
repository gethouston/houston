import type { AgentConfig } from "../../lib/types";
import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";
import { storeCatalogConfigs } from "./store-catalog";

// personal-assistant + blank first (the picker pins personal-assistant to the
// front), then the first-party "store" agents (bookkeeping, legal, sales, …)
// baked in from store/agents via scripts/gen-agent-templates.mjs. Their skills
// + instructions are seeded on create through the wire `seeds` contract; see
// ./store-template-loader.ts.
export const builtinConfigs: AgentConfig[] = [
  personalAssistantAgent,
  blankAgent,
  ...storeCatalogConfigs,
];
