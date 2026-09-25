import type { ShadowFamily } from "./http-shadow";

/**
 * Where one publish ended: `landed` (durable in the gateway's store, or
 * already there), `deferred` (not stored this time: the gateway was
 * unavailable or a revision conflict won; a later publish can land it), or
 * `unsupported` (this gateway cannot hold the family until the process
 * restarts, so retrying is pointless).
 */
export type ShadowPutResult = "landed" | "deferred" | "unsupported";

/** A put that reports whether the document landed, for callers that announce
 *  a document only once the gateway can serve it (the agent role). */
export interface DocPublisher {
  publish(family: ShadowFamily, doc: unknown): Promise<ShadowPutResult>;
}
