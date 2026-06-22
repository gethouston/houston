import type { AgentConfig } from "../../lib/types";
import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";

export const builtinConfigs: AgentConfig[] = [
  personalAssistantAgent,
  blankAgent,
];
