/**
 * Routines across the Agent Store boundary: a Houston `Routine` <-> an
 * `AgentRoutine` in the IR.
 *
 * Only two things travel: what wakes the routine and what it then does. The
 * installer's own account owns everything else — whether it is enabled, which
 * provider/model runs it, which connected account the trigger fires on, the
 * minted webhook key, the setup chat, the creator, the timestamps. Dropping
 * those is the whole point: a listing must never carry one person's wiring into
 * another person's agent.
 */
import type {
  AgentRoutine,
  AgentRoutineWake,
} from "@houston/agentstore-contract";
import type { Routine, RoutineChatMode } from "@houston/protocol";

/** An IR routine whose wake could not be derived — kept so validation REJECTS
 *  the publish instead of the routine vanishing from the listing in silence. */
type RoutineCandidate = Omit<AgentRoutine, "wake"> & {
  wake: AgentRoutineWake | undefined;
};

function wakeFromRoutine(routine: Routine): AgentRoutineWake | undefined {
  if (routine.schedule) return { kind: "schedule", cron: routine.schedule };
  const trigger = routine.trigger;
  if (!trigger) return undefined;
  // `kind` is optional on a Composio binding (it predates webhook wakes), so
  // anything that is not explicitly a webhook is Composio — the same rule
  // `normalizeRoutines` and the runtime read by.
  if (trigger.kind === "webhook") return { kind: "webhook" };
  return {
    kind: "composio",
    toolkit: trigger.toolkit,
    triggerSlug: trigger.trigger_slug,
    triggerConfig: trigger.trigger_config,
  };
}

/** Map an agent's selected routines to the IR's routine list. */
export function irRoutinesFromPortable(
  routines: Routine[],
): RoutineCandidate[] {
  return routines.map((r) => ({
    id: r.id,
    name: r.name,
    prompt: r.prompt,
    wake: wakeFromRoutine(r),
    ...(r.chat_mode ? { chatMode: r.chat_mode } : {}),
    ...(r.suppress_when_silent !== undefined
      ? { suppressWhenSilent: r.suppress_when_silent }
      : {}),
  }));
}

/**
 * The listing's integration chips: the publisher's own list, plus the UPPERCASED
 * toolkit of every Composio wake, appended in first-seen order. A publisher who
 * names no integration still gets the chip for an app their routines demonstrably
 * need, and an existing chip never moves (the order is the listing's).
 */
export function unionRoutineToolkits(
  integrations: string[],
  routines: Routine[],
): string[] {
  const out = [...integrations];
  const seen = new Set(out.map((i) => i.trim().toUpperCase()));
  for (const routine of routines) {
    const wake = wakeFromRoutine(routine);
    if (wake?.kind !== "composio") continue;
    const slug = wake.toolkit.trim().toUpperCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Map the IR's routines back to Houston routines for an install. The ids here
 * are placeholders: `remintRoutineIds` replaces every one at install time,
 * because the hosted trigger tables are keyed by routine id alone.
 */
export function portableRoutinesFromIr(
  routines: AgentRoutine[],
  now: string,
): Routine[] {
  return routines.map((r) => {
    const chatMode: RoutineChatMode = r.chatMode ?? "shared";
    return {
      id: r.id,
      name: r.name,
      prompt: r.prompt,
      ...(r.wake.kind === "schedule" ? { schedule: r.wake.cron } : {}),
      ...(r.wake.kind === "webhook"
        ? { trigger: { kind: "webhook" as const } }
        : {}),
      ...(r.wake.kind === "composio"
        ? {
            trigger: {
              kind: "composio" as const,
              toolkit: r.wake.toolkit,
              trigger_slug: r.wake.triggerSlug,
              trigger_config: r.wake.triggerConfig,
            },
          }
        : {}),
      enabled: true,
      suppress_when_silent: r.suppressWhenSilent ?? false,
      chat_mode: chatMode,
      // The only slug a listing proves this routine needs is its own wake's.
      integrations: r.wake.kind === "composio" ? [r.wake.toolkit] : [],
      created_at: now,
      updated_at: now,
    };
  });
}
