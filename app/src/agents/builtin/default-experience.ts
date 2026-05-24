import type { AgentConfig } from "../../lib/types";

export const blankAgent: AgentConfig = {
  id: "blank",
  name: "Start from scratch",
  description:
    "A blank agent with no pre-configured actions, instructions, or learnings — build it your way",
  icon: "Plus",
  category: "productivity",
  author: "Houston",
  tags: ["blank", "custom", "starter"],
  tabs: [
    { id: "activity", label: "Activity", builtIn: "board", badge: "activity" },
    { id: "routines", label: "Routines", builtIn: "routines" },
    { id: "files", label: "Files", builtIn: "files" },
    {
      id: "job-description",
      label: "Job Description",
      builtIn: "job-description",
    },
    { id: "integrations", label: "Integrations", builtIn: "integrations" },
  ],
  defaultTab: "activity",
  claudeMd: "",
};
