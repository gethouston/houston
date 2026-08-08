/**
 * The handoff for a mission created OUTSIDE a board, to the board that is
 * about to open it.
 *
 * A board that creates its own mission remembers it on the spot
 * (`components/board/use-just-created-mission.ts`, wired through
 * `useMcOpenConversation`'s `rememberCreated`) so the panel it opens keeps a
 * session key and an agent path until the cross-agent sweep returns the row.
 * The agent's self-setup mission (`lib/agent-setup-mission.ts`) is created by a
 * DIALOG, from a module-level function that cannot reach that hook's setter —
 * so it opened the panel on a card nobody could name yet: null session key,
 * null agent path, a blank welcome chat until the sweep caught up. This module
 * is the missing wire, the same shape as `registerSetupGreeting` one line below
 * it: a module-level publisher, a hook that subscribes.
 *
 * The offer is READ, never claimed. Several mission boards are kept alive at
 * once (the global one and every visited team's), so a one-shot offer is taken
 * by whichever of them mounts first — measurably a HIDDEN one — and the board
 * on the glass stays blank, which is the bug. Letting them all adopt costs
 * nothing: the fallback only ever applies on the board whose selection IS that
 * mission, and each drops it the moment the real row lands.
 *
 * What keeps it from leaking is therefore the TTL: an offer nobody opened is
 * gone after `CREATED_MISSION_HANDOFF_TTL_MS` and can never surface as the
 * fallback for a LATER create. A new publish replaces the previous offer.
 *
 * Dependency-free (only a clock), so `node --test` exercises it directly.
 */

/** What a just-created mission needs to be a real conversation on the board. */
export interface CreatedMission {
  activityId: string;
  agentPath: string;
  sessionKey: string;
}

/**
 * How long a published mission waits for a board to adopt it. The board that
 * opens it mounts in the same beat; anything older is an orphan, not a handoff.
 */
export const CREATED_MISSION_HANDOFF_TTL_MS = 30_000;

interface CreatedMissionHandoffDeps {
  now(): number;
}

export class CreatedMissionHandoff {
  private pending: { mission: CreatedMission; publishedAt: number } | null =
    null;
  private listeners = new Set<() => void>();
  private deps: CreatedMissionHandoffDeps;

  constructor(deps: CreatedMissionHandoffDeps) {
    this.deps = deps;
  }

  /**
   * Offer a mission to whichever board opens it next. Publishing again
   * replaces the previous offer: exactly one create is ever in flight, and the
   * newest one is the one whose panel is opening.
   */
  publish(mission: CreatedMission): void {
    this.pending = { mission, publishedAt: this.deps.now() };
    for (const listener of this.listeners) listener();
  }

  /**
   * The mission on offer, or null — nothing published, or the offer expired
   * (dropped here, so it can never resurface). Stable by reference across
   * reads: adopting it twice is the same value, not a re-render.
   */
  read(): CreatedMission | null {
    const pending = this.pending;
    if (!pending) return null;
    if (
      this.deps.now() - pending.publishedAt >=
      CREATED_MISSION_HANDOFF_TTL_MS
    ) {
      this.pending = null;
      return null;
    }
    return pending.mission;
  }

  /** Called on every publish. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const handoff = new CreatedMissionHandoff({ now: () => Date.now() });

/** A mission created OUTSIDE a board, for the board that is about to open it. */
export function publishCreatedMission(mission: CreatedMission): void {
  handoff.publish(mission);
}

/** The mission on offer for the board that is opening it, or null. */
export function readCreatedMission(): CreatedMission | null {
  return handoff.read();
}

/** Subscribe to publishes. Returns the unsubscribe. */
export function subscribeCreatedMission(listener: () => void): () => void {
  return handoff.subscribe(listener);
}
