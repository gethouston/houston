/**
 * The shape of the "your AI Employee is still being created" state (HOU-693)
 * and how it bends per-agent reads.
 *
 * On the hosted profile, creating an agent answers immediately while its
 * engine warms up in the background (HOU-649): the warm-up can take a couple
 * of minutes, and the platform gives the client no readiness field or event.
 * The readiness long-poll is `probe.ts`, the persistence parse `persist.ts`;
 * the Zustand store (`stores/agent-provisioning.ts`) wires them to the real
 * engine adapter, toast, and localStorage.
 *
 * Kept dependency-free so `node --test` can exercise it directly: the imports
 * below are types (erased at runtime) and the pure key factory.
 */

import type { ActivityStatus, MessageMention } from "@houston/engine-adapter";
import { queryKeys } from "../query-keys.ts";

/**
 * How long a creation may stay "in progress" before we call it failed. A cold
 * start is minutes at the very worst; past this the user deserves an error,
 * not an eternal spinner.
 */
export const PROVISIONING_TTL_MS = 10 * 60_000;

/**
 * A message sent while the engine was still warming up. The wire send is NOT
 * fired then (a held request dies with load-balancer timeouts or a reload) —
 * the message shows as a local bubble and the real send fires the moment the
 * readiness probe clears. Persisted with the entry so a relaunch mid-warm-up
 * still delivers it. Attachments can't persist: after a relaunch the send
 * falls back to `text`.
 */
export interface PendingWarmingSend {
  /** Unique per queued message — keys its in-memory prompt builder. */
  id: string;
  sessionKey: string;
  /** What the user typed — the bubble, and the fallback wire prompt. */
  text: string;
  /**
   * The wire prompt when it is NOT what the user typed and was already
   * knowable at queue time (a setup kickoff: the self-setup mission, the
   * routine / skill / integration setup chats). Stored because those sends
   * carry an empty `text` — without it a relaunch mid-warm-up leaves the
   * flush nothing to send. Which builders qualify, and why an attachment
   * prompt never does, is `lib/warming-send-prompt.ts`.
   */
  prompt?: string;
  /**
   * Board row to (up)create right before this send — carried by the FIRST
   * message of a new conversation. Writing it at flush time (engine awake,
   * id-upsert idempotent) is the only way it survives: a write fired during
   * the warm-up is a held request that dies with a reload.
   */
  row?: {
    id: string;
    title: string;
    description: string;
    agent?: string;
    provider?: string;
    model?: string;
    /**
     * Status the row should land with (default `running`). The create route
     * can't carry it, so the flush patches it right after the create. The
     * welcome mission settles its queued row to `needs_you` when the
     * greeting reveals (HOU-713).
     */
    status?: ActivityStatus;
  };
  /**
   * A row-only entry (HOU-713): the board row IS the payload — no bubble, no
   * wire send at flush. Carried by the welcome mission, whose greeting is
   * client-rendered.
   */
  rowOnly?: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  /** Per-turn mode pin (composer "Mode" selector), forwarded at flush time. */
  mode?: "execute" | "plan" | "auto";
  /** Teammates this message @mentions (HOU-944). Plain JSON, so it survives
   *  the localStorage mirror and a relaunch mid-warm-up alongside the text. */
  mentions?: MessageMention[];
  /** Epoch ms the message was queued — orders the optimistic board rows. */
  queuedAt?: number;
  /**
   * Source text for the async AI title pass, carried only when the caller
   * wanted one (no explicit title). The pass can't run at queue time — the
   * engine can't answer — so the flush fires it after the row lands (HOU-713).
   */
  titleText?: string;
}

export interface ProvisioningEntry {
  agentId: string;
  /** What the engine adapter addresses the agent by (`agent.folderPath`). */
  agentPath: string;
  /** Epoch ms of the create call — the TTL anchor. */
  since: number;
  /**
   * Why the agent is warming. `"create"` = a just-created agent (HOU-693):
   * it has no data by definition, so per-agent reads may answer "nothing
   * yet" instantly. `"asleep"` = an EXISTING agent whose pod was detected
   * scaled-to-zero on open (HOU-730): it HAS data — the locally persisted
   * list/transcript caches are already painting it — so reads must NOT
   * short-circuit to empty (an instant empty success wipes the painted
   * cards AND the on-disk cache); they ride the gateway hold instead and
   * settle when the pod wakes. Absent on entries persisted by older builds:
   * treated as `"create"` (the pre-split behavior).
   */
  reason?: "create" | "asleep";
  /** Messages queued while warming, flushed on ready (in order). */
  pendingSends?: PendingWarmingSend[];
  /**
   * The TTL elapsed with no answer yet (HOU-693 regression: the entry used to
   * be cleared here, silently dropping the user's still-visible first chat).
   * Sticky once set — the store re-arms a fresh probe window on it rather
   * than giving up, and the UI switches to a "still starting" state instead
   * of the initial "we're creating your agent" copy. Never cleared back to
   * false; a fresh entry (new create/rename) replaces it instead.
   */
  timedOut?: boolean;
}

/**
 * Whether this entry is a just-created agent (see the `reason` doc above),
 * from its mark until the entry clears — past its engine's first answer, for
 * the whole handoff. What waits on the creation reads this, never
 * `warmingReadsAnswerEmpty`: a config the handoff is still re-reading is not
 * yet the real one.
 */
export function warmingIsCreation(entry: ProvisioningEntry): boolean {
  return entry.reason !== "asleep";
}

/**
 * Entries whose engine answered and whose queued sends went out. In memory
 * only: a relaunch re-probes, and the probe re-opens the reads.
 */
const readsOpened = new WeakSet<ProvisioningEntry>();

/**
 * Send this entry's per-agent reads to the engine while the entry stays up.
 * The handoff calls it before its refetch: a refetch answered by the
 * placeholder would cache a successful empty result that nothing re-reads.
 */
export function openWarmingReads(entry: ProvisioningEntry): void {
  readsOpened.add(entry);
}

/**
 * Whether per-agent READS may answer "nothing yet" for this warming entry
 * instead of riding the gateway hold: a just-created agent whose reads the
 * handoff has not opened yet. Writes are unaffected (they always park or
 * block, whatever the reason).
 */
export function warmingReadsAnswerEmpty(entry: ProvisioningEntry): boolean {
  return warmingIsCreation(entry) && !readsOpened.has(entry);
}

/**
 * The query keys a completed warm-up must refetch BEFORE its optimistic rows
 * are dropped (HOU-713), so the board hands off to the real rows the flush
 * wrote without a one-frame gap.
 *
 * The FIRST is the whole point and the one that regressed: the boards read the
 * cross-agent sweep, whose key embeds every agent's path
 * (`["all-conversations", ...paths]`), so only the PREFIX matches the roster
 * variant the open board is mounted on. Invalidating the per-agent
 * `["activity", path]` alone refetched nothing any board shows, and the
 * optimistic rows vanished until the sweep independently returned.
 *
 * `["activity", path]` still belongs here: the per-agent surfaces that read it
 * live (the agent chat panel, the skill / routine / integration setup chats,
 * agent-admin knowledge) must see the flushed rows too.
 *
 * `["config", path]` too: while the agent was created its reads answered an
 * empty placeholder (`warmingReadsAnswerEmpty`), cached as a successful empty
 * config, and nothing else re-reads it, so the first-day offer it carries
 * would never appear.
 *
 * Every key here refetches after `openWarmingReads`: the sweep skips a
 * creating agent and its per-agent reads answer the placeholder until then.
 */
export function warmingFlushRefetchKeys(
  agentPath: string,
): readonly (readonly unknown[])[] {
  return [
    queryKeys.allConversations([]),
    queryKeys.activity(agentPath),
    queryKeys.config(agentPath),
  ];
}
