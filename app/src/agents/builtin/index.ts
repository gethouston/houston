import type { AgentConfig } from "../../lib/types";
import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";
import { storeCatalogConfigs } from "./store-catalog";

export const builtinConfigs: AgentConfig[] = [
  personalAssistantAgent,
  blankAgent,
  ...storeCatalogConfigs,
];
