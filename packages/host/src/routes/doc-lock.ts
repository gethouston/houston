/**
 * The host's door to the shared document lock. The registry lives in
 * `@houston/domain` (`doc-lock.ts`) because domain writers lock the same docs
 * these routes do — a second registry here would key the same documents and
 * serialize against nothing.
 */
export { withDocLock } from "@houston/domain";
