// When the cross-agent mission sweep may be BELIEVED.
//
// Pure, and load-bearing: every watcher that takes a baseline from the sweep
// (the guided setup waiting for a first task, a lesson beat waiting for a new
// conversation) is deciding, from this one boolean, whether the count it is
// about to snapshot is an answer or an absence. Read the absence as zero and
// the watcher pays itself out for something the user never did.

export interface SweepReadiness {
  /** The agent roster has answered at least once (`useAgentStore().loaded`). */
  rosterLoaded: boolean;
  /** How many agents the sweep covers. */
  agentCount: number;
  /** The sweep query is holding a result. */
  hasData: boolean;
  /** A fetch is in flight, so the result in hand may be about to move. */
  isFetching: boolean;
}

/**
 * An empty ROSTER settles at once: the sweep is disabled with nobody to ask, so
 * zero is the true count rather than an answer still coming, and a watcher is
 * not left waiting for a request that will never be made.
 *
 * But only once the roster itself has loaded. Boot has a gap between the
 * workspace resolving and the first `loadAgents` returning, and an identity
 * change resets the store to empty on purpose — in both windows a roster with
 * agents reads as a roster with none. Taken as settled-at-zero, a lesson beat
 * armed in that gap snapshots a baseline of 0, then the real sweep lands and
 * every mission the user already had reads as brand new: the lesson completes
 * itself, with experience and confetti and no user action at all.
 */
export function sweepSettled(readiness: SweepReadiness): boolean {
  if (!readiness.rosterLoaded) return false;
  if (readiness.agentCount === 0) return true;
  return readiness.hasData && !readiness.isFetching;
}
