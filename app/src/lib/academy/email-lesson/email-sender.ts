import type { Agent } from "../../types.ts";

/**
 * Who sends the lesson's email, and through what. Pure, so the choices
 * unit-test without React (`app/tests/academy-email-sender.test.ts`).
 */

/** The email apps the lesson can send through, in the order it prefers them. */
export const EMAIL_TOOLKITS = [
  { toolkit: "gmail", label: "Gmail" },
  { toolkit: "outlook", label: "Outlook" },
] as const;

export type EmailToolkit = (typeof EMAIL_TOOLKITS)[number];

/** The toolkit slugs a connected email is recognised by. */
export const EMAIL_TOOLKIT_SLUGS: readonly string[] = EMAIL_TOOLKITS.map(
  (entry) => entry.toolkit,
);

/**
 * The email app the send goes through: the first of {@link EMAIL_TOOLKITS}
 * with an ACTIVE connection. A pending or errored connection does not count —
 * the agent could not send through it.
 */
export function connectedEmailToolkit(
  connections: readonly { toolkit: string; status: string }[],
): EmailToolkit | null {
  const active = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.toolkit),
  );
  return EMAIL_TOOLKITS.find((entry) => active.has(entry.toolkit)) ?? null;
}

export interface EmailSenderChoice {
  /** The AI Employees the user can pick from, in sidebar order. */
  candidates: Agent[];
  /** The one that sends, or null when there is nobody yet. */
  sender: Agent | null;
}

/**
 * The AI Employees the lesson can send with, and the one that does.
 *
 * The sender is the one the user picked while it is still an employee, else
 * the one whose screen is open, else the first in sidebar order, so the
 * lesson always has a sensible default and a pick never points at someone
 * who has since left.
 */
export function emailSenderChoice(args: {
  /** Every AI Employee, in sidebar order. */
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
