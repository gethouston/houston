import type { ShadowFamily } from "./http-shadow";

export type ShadowPutResult = "landed" | "deferred" | "unsupported";

export interface DocPublisher {
  publish(family: ShadowFamily, doc: unknown): Promise<ShadowPutResult>;
}
