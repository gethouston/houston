import type { Agent } from "../../types.ts";

export const EMAIL_TOOLKITS = [
  { toolkit: "gmail", label: "Gmail" },
  { toolkit: "outlook", label: "Outlook" },
] as const;

export type EmailToolkit = (typeof EMAIL_TOOLKITS)[number];

export const EMAIL_TOOLKIT_SLUGS: readonly string[] = EMAIL_TOOLKITS.map(
  (entry) => entry.toolkit,
);

export function connectedEmailToolkit(
  connections: readonly { toolkit: string; status: string }[],
): EmailToolkit | null {
  const active = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.toolkit),
  );
  return EMAIL_TOOLKITS.find((entry) => active.has(entry.toolkit)) ?? null;
}

export interface EmailSenderChoice {
  candidates: Agent[];
  sender: Agent | null;
}

export function emailSenderChoice(args: {
  agents: readonly Agent[];
  activeAgentId: string | null;
  pickedAgentId: string | null;
}): EmailSenderChoice {
  const candidates = [...args.agents];
  const find = (id: string | null) =>
    candidates.find((agent) => agent.id === id);
  const sender =
    find(args.pickedAgentId) ?? find(args.activeAgentId) ?? candidates[0];
  return { candidates, sender: sender ?? null };
}
