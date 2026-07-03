/**
 * `@houston/sdk/react` — React bindings for the headless Houston SDK.
 *
 * Two hooks, both taking the SDK explicitly as their first argument:
 *  - {@link useSdkSnapshot} — read a scope snapshot (the reactive read side),
 *  - {@link useSdkEvent} — react to a typed event on the global channel.
 *
 * **No `SdkProvider`/`useSdk()` context is shipped.** The web app already
 * threads its long-lived client explicitly (constructed once with `useMemo`,
 * passed down — see `packages/web/src/new-engine/app.tsx`), so a context would
 * be a second, redundant way to reach the same singleton. Passing `sdk` in
 * keeps these hooks pure and mirrors the established wiring. If a future
 * consumer needs implicit access, add the context then — not speculatively.
 */

export type { EventSource } from "./use-sdk-event";
export { subscribeToEvent, useSdkEvent } from "./use-sdk-event";
export type {
  SnapshotSource,
  SnapshotStoreAdapter,
} from "./use-sdk-snapshot";
export { snapshotStoreAdapter, useSdkSnapshot } from "./use-sdk-snapshot";
