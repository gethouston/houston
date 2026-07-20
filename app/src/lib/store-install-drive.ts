/**
 * Pure decision core for the store-install deep link, factored out of
 * `useStoreInstallDeepLink` so it can be exhaustively tested without a React
 * renderer.
 *
 * A store-install deep link seeds the import wizard exactly once per intent.
 * The hazard is a SECOND delivery of the same slug: the website "Open in
 * Houston" button is never disabled (a double-click fires the
 * `houston://store/install` deep link twice), and on cold start the shell both
 * stashes AND emits the URL, so the drain and the live event can both surface
 * it. Without dedup that second delivery re-arms the pending slug and re-fires
 * a full drive (double import + double install ping) the moment the wizard
 * closes.
 *
 * This reducer runs once per processing tick. It owns the small amount of
 * session state that survives across ticks (the refs) so the hook stays a thin
 * shell that only performs side effects the reducer names.
 */

/** Session state that persists across processing ticks (held in refs). */
export interface StoreInstallDriveState {
  /** A drive is in flight (import fetch awaiting). */
  running: boolean;
  /** Slug of the drive currently in flight or whose wizard is still open. */
  drivenSlug: string | null;
  /** Whether the import wizard was open on the previous tick. */
  wizardWasOpen: boolean;
}

/** Inputs read from the current render. */
export interface StoreInstallDriveInput {
  /** Validated slug waiting to be driven, or null. */
  pendingSlug: string | null;
  /** The import wizard is currently open. */
  wizardOpen: boolean;
  /** The shell can host the wizard (workspace + agents ready, no tutorial). */
  shellLive: boolean;
}

/**
 * - `drive`: begin the import for `slug`; the caller clears the pending slug and
 *   marks the run in flight.
 * - `drop`: a duplicate delivery of an already-driven slug; clear the pending
 *   slug and do nothing else.
 * - `idle`: nothing to do this tick (retain any pending slug — it is waiting for
 *   the shell to go live or for an open wizard to close).
 */
export type StoreInstallDriveEffect = "drive" | "drop" | "idle";

export interface StoreInstallDriveDecision {
  next: StoreInstallDriveState;
  effect: StoreInstallDriveEffect;
  /** Set only when `effect === "drive"`. */
  slug?: string;
}

export const initialStoreInstallDriveState: StoreInstallDriveState = {
  running: false,
  drivenSlug: null,
  wizardWasOpen: false,
};

/**
 * Decide what one processing tick should do. Pure: same inputs → same decision,
 * no side effects, no store reads.
 */
export function decideStoreInstallDrive(
  state: StoreInstallDriveState,
  input: StoreInstallDriveInput,
): StoreInstallDriveDecision {
  let drivenSlug = state.drivenSlug;

  // Wizard just closed (open -> closed): the drive it hosted is finished, so the
  // same slug may legitimately be requested again by a genuinely new, post-close
  // deep link. Only the transition clears it — the pre-open window (running but
  // wizard not yet open) is also "not open" and must NOT clear the guard.
  if (state.wizardWasOpen && !input.wizardOpen) drivenSlug = null;

  const base: StoreInstallDriveState = {
    running: state.running,
    drivenSlug,
    wizardWasOpen: input.wizardOpen,
  };

  if (!input.pendingSlug) return { next: base, effect: "idle" };

  // Duplicate delivery of the slug already driven (button double-click, or the
  // cold-start drain and the live event both surfacing the same URL). Drop it:
  // never re-drive, never re-ping.
  if (input.pendingSlug === drivenSlug) return { next: base, effect: "drop" };

  // Not yet drivable — a wizard is open, the shell is not live, or a drive is in
  // flight. Retain the pending slug and wait for a later tick.
  if (input.wizardOpen || !input.shellLive || state.running) {
    return { next: base, effect: "idle" };
  }

  return {
    next: {
      running: true,
      drivenSlug: input.pendingSlug,
      wizardWasOpen: input.wizardOpen,
    },
    effect: "drive",
    slug: input.pendingSlug,
  };
}
