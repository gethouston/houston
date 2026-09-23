/**
 * Label surface of ScratchView: the optional overrides a host app passes and
 * the English defaults every field falls back to. `ui/` stays i18n-agnostic, so
 * these are flat strings with no interpolation — the app hands in `t()` results.
 * Defaults are `Required<ScratchViewLabels>`, so a new label cannot be added
 * without authoring its fallback copy here.
 */

export interface ScratchViewLabels {
  titleLabel?: string;
  titlePlaceholder?: string;
  titleHint?: string;
  slugPreviewPrefix?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  descriptionHint?: string;
  bodyLabel?: string;
  bodyPlaceholder?: string;
  bodyHint?: string;
  submit?: string;
  submitting?: string;
  errorTitleRequired?: string;
  errorDescriptionRequired?: string;
  errorBodyRequired?: string;
  errorSlugTaken?: string;
}

export const DEFAULT_LABELS: Required<ScratchViewLabels> = {
  titleLabel: "What should this skill do?",
  titlePlaceholder: "Draft a contract",
  titleHint: "Use the phrase you'd say in chat. Houston turns it into a slug.",
  slugPreviewPrefix: "Saved as",
  descriptionLabel: "One-line description",
  descriptionPlaceholder: "Drafts a starter contract you can review and sign.",
  descriptionHint:
    "Shown on the skill card. Say what the user gets, not how it works.",
  bodyLabel: "Instructions for the agent",
  bodyPlaceholder:
    "## Procedure\n\n1. Ask the user what kind of contract.\n2. Pull the latest version from Drive.\n3. Fill it in and share for review.\n",
  bodyHint: "Markdown. The agent reads this when the skill runs.",
  submit: "Create skill",
  submitting: "Creating...",
  errorTitleRequired: "Give your skill a title.",
  errorDescriptionRequired:
    "A description is required. Add one line saying what this skill does.",
  errorBodyRequired: "Add at least one instruction step.",
  errorSlugTaken: "A skill with this name already exists.",
};
