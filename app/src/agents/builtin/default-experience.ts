import type { AgentConfig } from "../../lib/types";

export const blankAgent: AgentConfig = {
  id: "blank",
  name: "Start from scratch",
  description: "A blank agent with no pre-configured actions, instructions, or learnings — build it your way",
  icon: "Plus",
  category: "productivity",
  author: "Houston",
  tags: ["blank", "custom", "starter"],
  claudeMd: "",
};
