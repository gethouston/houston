// Re-export: the tracker lives in the engine adapter, whose gateway fetch is
// one of its writers (see ./engine-waking-error.ts for why adapter code can
// never import from app). Same module instance on both sides; keeps the app's
// import path and the node:test entry point stable.
export {
  createWakingStuckTracker,
  WAKING_EPISODE_GAP_MS,
  WAKING_STUCK_THRESHOLD_MS,
  type WakingStuck,
  type WakingStuckTracker,
  wakingStuckTracker,
} from "../../../packages/web/src/engine-adapter/waking-stuck-tracker.ts";
