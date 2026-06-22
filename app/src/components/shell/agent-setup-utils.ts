import type { AgentSetupFormValues } from "./agent-setup-form";

export const FOCUS_LABELS: Record<string, string> = {
  personalProductivity: "Personal productivity",
  workBusiness: "Work and business",
  researchLearning: "Research and learning",
  writingEditing: "Writing and editing",
  codingDev: "Coding and development",
  customerSupport: "Customer support",
  dataAnalysis: "Data and analysis",
  creativeDesign: "Creative and design",
};

export const TRAIT_LABELS: Record<string, string> = {
  concise: "Concise",
  thorough: "Thorough",
  friendly: "Friendly",
  professional: "Professional",
  creative: "Creative",
  analytical: "Analytical",
  proactive: "Proactive",
  cautious: "Cautious",
  structured: "Structured",
  casual: "Casual",
};

/** Serialize form values into a plain English description string for the AI. */
export function serializeFormValues(values: AgentSetupFormValues): string {
  const lines: string[] = [];

  if (values.focus) {
    lines.push(`Focus: ${FOCUS_LABELS[values.focus] ?? values.focus}`);
  }
  if (values.traits.length > 0) {
    lines.push(
      `Traits: ${values.traits.map((k) => TRAIT_LABELS[k] ?? k).join(", ")}`,
    );
  }
  lines.push(`Response detail level: ${values.verbosity}/5`);
  lines.push(
    `Ask clarifying questions before answering: ${values.askFirst ? "yes" : "no"}`,
  );
  if (values.extra.trim()) {
    lines.push(`Additional instructions: ${values.extra.trim()}`);
  }
  return lines.join("\n");
}
