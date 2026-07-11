/**
 * `@houston/sdk/react` — React bindings for the headless Houston SDK.
 *
 * One hook, taking the SDK explicitly as its first argument:
 *  - {@link useSdkSnapshot} — read a scope snapshot (the reactive read side).
 *
 * **No `SdkProvider`/`useSdk()` context is shipped.** The web app already
 * threads its long-lived client explicitly (constructed once with `useMemo`,
 * passed down — see `packages/web/src/new-engine/app.tsx`), so a context would
 * be a second, redundant way to reach the same singleton. Passing `sdk` in
 * keeps these hooks pure and mirrors the established wiring. If a future
 * consumer needs implicit access, add the context then — not speculatively.
 */

export type {
  SnapshotSource,
  SnapshotStoreAdapter,
} from "./use-sdk-snapshot";
export { snapshotStoreAdapter, useSdkSnapshot } from "./use-sdk-snapshot";
