export interface AssistantSetup {
  workspaceName: string;
  assistantName: string;
  color: string;
  focus: string;
  approvalRule: string;
}

export const PERSONAL_ASSISTANT_CONFIG_ID = "personal-assistant";

export function defaultAssistantSetup(labels: {
  workspaceName: string;
  assistantName: string;
  focus: string;
  approvalRule: string;
}): AssistantSetup {
  return {
    ...labels,
    color: "navy",
  };
}

export function buildAssistantInstructions(setup: AssistantSetup): string {
  return `# ${setup.assistantName}

You are my Personal assistant in Houston.

## Main job
${setup.focus.trim()}

## What you already come with
You ship with a ready-made morning-briefing routine and a meeting-prep skill. Lean on them, and mention them when they fit what I ask instead of building the same thing from scratch.

## Approval rule
${setup.approvalRule.trim()}

## How to work
- Prefer Skills for repeatable work.
- Prefer Routines for scheduled work.
- Ask one clear question when required information is missing.
- Keep updates short and practical.
- Never send messages or make changes on my behalf unless I approve first.
`;
}
