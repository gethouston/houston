/** The connected app (and, when known, the exact action) a workflow step runs. */
export interface SkillStepIntegration {
  /** Composio toolkit slug, lowercase (e.g. "gmail"). */
  toolkit: string;
  /**
   * Exact action slug, uppercase (e.g. "GMAIL_SEND_EMAIL"); null when the step
   * names the app but not which of its actions it runs.
   */
  action: string | null;
}

/** One step of a skill's workflow, as the domain parser reads it out of SKILL.md. */
export interface SkillWorkflowStepItem {
  title: string;
  /** The step's supporting lines, newline-separated; null when the title says it all. */
  detail: string | null;
  /** The app the step acts on; null when it touches none. */
  integration: SkillStepIntegration | null;
}
