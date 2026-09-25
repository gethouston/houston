import type { TeamView } from "../../teams-model.ts";
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
  /** The AI Employees the user can pick from: the current team's. */
  candidates: Agent[];
  /** The one that sends, or null when the team has nobody yet. */
  sender: Agent | null;
}

/**
 * The current team's AI Employees and the one that sends.
 *
 * The current team is the one the user last had open, else the first team.
 * The sender is the one the user picked while it is still on that team, else
 * the team's first AI Employee — so the lesson always has a sensible default
 * and a pick never points at someone who has since left.
 */
export function emailSenderChoice(args: {
  teams: readonly TeamView[];
  activeTeamId: string | null;
  pickedAgentId: string | null;
}): EmailSenderChoice {
  const team =
    args.teams.find((candidate) => candidate.id === args.activeTeamId) ??
    args.teams[0];
  const candidates = team?.agents ?? [];
  const picked = candidates.find((agent) => agent.id === args.pickedAgentId);
  return { candidates, sender: picked ?? candidates[0] ?? null };
}
