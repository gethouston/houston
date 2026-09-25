/**
 * Where the self-setup mission's hello gets its two facts, and when it is whole
 * enough to render. The React wiring is `hooks/use-setup-hello.ts`; the chat
 * panel only consumes the answer.
 *
 * The hello is the FIRST item of that mission's feed, naming the agent and the
 * job it was hired for, and it is permanent — the agent's own words land under
 * it, never in place of it. The hidden prompt tells the model the user has
 * already read it, so the agent never introduces itself a second time.
 *
 * ONE rule decides where the two facts come from. The record the create wrote
 * (`setup-mission-greeting.ts`) is the source while it exists: it is complete
 * from the first paint, before the engine has answered anything. Past its TTL,
 * on another device or after a later reload the persisted truth takes over: the
 * activity's own setup marker plus the role in the agent's job description. The
 * create wrote that description from the same answers it recorded, so the
 * handover never changes the sentence.
 */

import { isAgentSetupMode } from "./agent-setup-mode.ts";
import {
  type SetupGreetingEntry,
  setupGreetingRole,
} from "./setup-mission-greeting.ts";

/** The two facts the hello sentence names. */
export interface SetupHello {
  name: string;
  /** The job the agent was hired for, or null when it was hired for none. */
  role: string | null;
}

export interface SetupHelloState {
  /** True when this conversation is an agent's self-setup mission. */
  isSetupMission: boolean;
  /** The hello to render, or null while it would be incomplete. */
  hello: SetupHello | null;
}

export interface SetupMissionMarks {
  /** The creation-time record for this conversation, when there is one. */
  entry: SetupGreetingEntry | null;
  /** The activity's own `agent` (mode) field, which outlives the record. */
  activityAgentMode: string | null | undefined;
}

export function isSetupMissionChat(marks: SetupMissionMarks): boolean {
  return !!marks.entry || isAgentSetupMode(marks.activityAgentMode);
}

/**
 * The agent path whose job description the hello needs read, or undefined when
 * no read is warranted.
 *
 * The read is enabled for the WHOLE setup mission, record or no record. Gating
 * it on the record being gone made the handover a visible hole: when the record
 * expired with the chat open, the query enabled cold, had fetched nothing, and
 * the hello blinked out for a round trip. Every other chat still pays nothing —
 * this answers undefined there, which leaves the query disabled.
 */
export function setupInstructionsTarget(
  marks: SetupMissionMarks & { agentPath: string | null | undefined },
): string | undefined {
  if (!marks.agentPath) return undefined;
  return isSetupMissionChat(marks) ? marks.agentPath : undefined;
}

export interface SetupHelloInput extends SetupMissionMarks {
  /** The agent's name as the roster holds it — the fallback once the record
   *  that carried its own copy is gone. */
  agentName: string | undefined;
  /** The agent's job description, once read. Empty means unread: see below. */
  instructions: string | undefined;
  /** False while that read is still in flight. */
  instructionsFetched: boolean;
}

/**
 * The hello for this conversation. Without the record it waits for the job
 * description to be read, so the sentence is never shown without the role and
 * then rewritten with it. A missing name holds it back for the same reason:
 * "Hi, I'm ." is not a greeting.
 *
 * An EMPTY description is an UNREAD one, whatever the fetch flag says: a
 * hosted agent that is still being created answers its own file reads with `""`
 * (`lib/tauri.ts` isAgentPathCreating), so a fetched-but-empty text says
 * nothing about the job. A failed read leaves it undefined. Trusting it latches the hello into its no-role shape, which is the
 * sentence the user reads the moment the creation record expires.
 */
export function deriveSetupHello(input: SetupHelloInput): SetupHelloState {
  const isSetupMission = isSetupMissionChat(input);
  if (!isSetupMission) return { isSetupMission: false, hello: null };

  const name = input.entry?.agentName ?? input.agentName;
  const description = input.instructionsFetched
    ? input.instructions || undefined
    : undefined;
  const ready = !!input.entry || !!description;
  if (!ready || !name) return { isSetupMission, hello: null };

  return {
    isSetupMission,
    hello: {
      name,
      role: input.entry ? input.entry.role : setupGreetingRole(description),
    },
  };
}
