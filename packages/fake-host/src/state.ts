/**
 * In-memory state for the fake Houston host.
 *
 * Models just enough of the host + per-agent runtime for the desktop
 * UI (app/src) to boot and run on the host adapter (host mode):
 * agents, their `.houston/**` files (the board reads `.houston/activity/
 * activity.json` directly — files-first), and per-conversation chat history. One
 * process serves every test; `reset()` restores the seed between tests.
 *
 * `.houston/activity/activity.json` and the `/agents/:id/activities` REST route
 * are the SAME data (as in the real host), so a chat turn flipping a
 * card's status (PATCH /activities) shows up on the board (which reads the file).
 *
 * Wire types come from the real packages so a contract change breaks the
 * typecheck here instead of silently drifting the mock.
 *
 * This module is the aggregate front door; the pieces live in `state-store.ts`
 * (seed + singleton + reactivity), `state-agents.ts` (agents + files),
 * `state-activities.ts` (board), and `state-history.ts` (chat history).
 */

export * from "./state-activities";
export * from "./state-agents";
export * from "./state-history";
export * from "./state-integrations";
export * from "./state-providers";
export * from "./state-routines";
export * from "./state-skills";
export * from "./state-store";
export * from "./state-teams";
export * from "./state-workspace";
