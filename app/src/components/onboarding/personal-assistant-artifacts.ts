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

export function buildAssistantInstructions(
  setup: AssistantSetup,
  missionTitle: string,
): string {
  return `# ${setup.assistantName}

You are my Personal assistant in Houston.

## Main job
${setup.focus.trim()}

## First workflow
Set up and run: ${missionTitle}.

## Approval rule
${setup.approvalRule.trim()}

## How to work
- Prefer Skills for repeatable work.
- Prefer Routines for scheduled work.
- Use connected apps through Composio when a task needs inbox, calendar, documents, or other accounts.
- Ask one clear question when required information is missing.
- Keep updates short and practical.
- Never send messages, create calendar events, or change connected apps unless I approve first.
`;
}
