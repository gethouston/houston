import type { AgentConfig } from "../../lib/types";

export const personalAssistantAgent: AgentConfig = {
  id: "personal-assistant",
  name: "Personal assistant",
  description:
    "A general-purpose assistant for your day, inbox, calendar, follow-ups, and recurring work.",
  icon: "Sparkles",
  category: "productivity",
  author: "Houston",
  tags: ["personal", "assistant", "starter", "inbox", "calendar"],
  claudeMd:
    "# Personal assistant\n\nHelp me stay organized. Ask before sending messages or making changes on my behalf.",
};
