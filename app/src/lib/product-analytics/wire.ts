/**
 * What the gateway's `/v1/analytics/events` ingest speaks. Shared by the queue
 * (which fills these shapes) and the transport (which posts them), so neither
 * owns the contract alone and a change to it is a change to one file.
 */

import type { ProductEventName, ProductEventProps } from "./catalogue.ts";

export interface ProductAnalyticsEvent {
  /** Client-minted v4, so a retried batch is idempotent server-side. */
  readonly id: string;
  readonly name: ProductEventName;
  /** RFC3339 with milliseconds — when it happened on this device. */
  readonly ts: string;
  readonly properties: ProductEventProps;
}

/** One batch's device identity, sent alongside the events. */
export interface ProductAnalyticsContext {
  /** The per-launch id every PostHog event carries as a super property, so a
   *  sit-down reads as one session on both pipes without a join table. */
  readonly session_id: string;
  readonly app_version: string;
  readonly platform: "desktop" | "web";
  /**
   * This install's stable anonymous id (`lib/install-id.ts`), the one thing
   * that tells two launches on the same machine apart from two machines.
   * Optional because it is read through the engine and arrives an async hop
   * after the app does: the batches that ship first simply carry no id
   * (`context.ts`), and a flush never waits for it.
   */
  readonly install_id?: string;
}

export interface RejectedProductEvent {
  readonly id: string;
  readonly reason: string;
}

export type ProductAnalyticsSendResult =
  /** Stored (or knowingly discarded by the gateway); `rejected` names the
   *  events it refused, which are never worth resending. */
  | {
      readonly status: "ok";
      readonly rejected?: readonly RejectedProductEvent[];
    }
  /** No signed-in session to attribute the batch to. Not a failure. */
  | { readonly status: "no-session" }
  | { readonly status: "failed" };
