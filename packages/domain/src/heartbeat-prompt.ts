import type { InteractionStep } from "@houston/protocol";
import type { HeartbeatSection, HeartbeatSnapshot } from "./heartbeat-snapshot";

/**
 * The hidden prompt of the AI Manager's morning briefing turn. Nobody typed
 * it (the host wraps it in the auto-continue marker, so the chat never shows
 * it as the person's bubble), and the runtime has no idea what day it is
 * where the person lives, so the local date rides in it.
 */
export interface HeartbeatPromptInput {
  localDate: string;
  localTime: string;
  timezone: string;
  snapshot: HeartbeatSnapshot;
}

const WAITING_ON: Record<InteractionStep["kind"], string> = {
  question: "waiting on an answer to a question",
  signin: "waiting on a sign-in",
  connect: "waiting on an app to be connected",
  provider_connect: "waiting on an AI account to be connected",
  credential: "waiting on a key or password",
  hands_on: "waiting on the person to do something in Houston",
  plan_ready: "waiting on a plan to be reviewed",
  suggest_actions: "offering next steps",
  suggest_reusable: "offering to save something for reuse",
};

function lines<T>(
  title: string,
  section: HeartbeatSection<T>,
  line: (item: T) => string,
): string[] {
  if (section.items.length === 0) return [];
  const out = [`${title}:`, ...section.items.map((item) => `- ${line(item)}`)];
  if (section.more > 0) out.push(`- and ${section.more} more`);
  return [...out, ""];
}

/** The snapshot as plain lines, one section per heading, empty ones left out. */
export function renderHeartbeatSnapshot(snapshot: HeartbeatSnapshot): string {
  return [
    ...lines("Waiting on the person", snapshot.needsYou, (item) =>
      item.waitingOn
        ? `${item.agent}: "${item.title}" (${WAITING_ON[item.waitingOn]})`
        : `${item.agent}: "${item.title}"`,
    ),
    ...lines(
      "Routine runs that failed or reported something",
      snapshot.routineRuns,
      (item) => {
        const what = item.status === "error" ? "failed" : "reported";
        return item.summary
          ? `${item.agent}: "${item.routine}" ${what}: ${item.summary}`
          : `${item.agent}: "${item.routine}" ${what}`;
      },
    ),
    ...lines(
      "Routines paused after failing again and again",
      snapshot.pausedRoutines,
      (item) =>
        `${item.agent}: "${item.routine}" (paused after ${item.failures} failed runs)`,
    ),
    ...lines(
      "Finished since the last briefing",
      snapshot.done,
      (item) => `${item.agent}: "${item.title}"`,
    ),
  ]
    .join("\n")
    .trim();
}

export function heartbeatPrompt(input: HeartbeatPromptInput): string {
  return [
    `This is your automatic morning check-in. The person did not type this message. It is ${input.localDate}, ${input.localTime} where they live (${input.timezone}).`,
    "",
    "Write them a short morning briefing about their team:",
    "1. Open with what needs their attention first, naming the AI Employee each item belongs to.",
    "2. Then summarize, briefly, what got done.",
    "3. Use plain, warm, non-technical language and keep it short. Write in the language the person usually uses with you.",
    "4. Do NOT start, retry, pause or change anything yourself. This is a report, not a to-do list you act on.",
    "5. End with suggest_actions offering to hand the top items to the right AI Employee (for example, to retry a failed routine or to answer a waiting question).",
    "",
    "You may use your read-only tools (list_agents, list_missions, houston_call for listRoutineRuns or integrationStatus) to check details before you write.",
    "",
    "What Houston saw since the last briefing:",
    "",
    renderHeartbeatSnapshot(input.snapshot),
  ].join("\n");
}
