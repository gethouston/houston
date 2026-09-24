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
  /**
   * The marketing site's visitor id (`lib/web-visitor-landing.ts`), carried
   * into the app by the link the site builds. It is what joins a signed-in
   * session back to the landing page it came from, so it rides EVERY batch
   * like the install id does. Optional because only the web surface can have
   * one: the desktop app has no link to land on, and a visit that reached the
   * app any other way brings no id.
   */
  readonly visitor_id?: string;
}

export interface RejectedProductEvent {
  readonly id: string;
  readonly reason: string;
}

/** What the queue tells the transport about the flush a batch belongs to. */
export interface ProductAnalyticsSendOptions {
  /**
   * The goodbye ride (`sink.ts` onAppHidden): the window is going away, so the
   * request has to outlive the page. That is what `keepalive` buys, and it is
   * the ONLY flush worth its price — keepalive caps the whole request body at
   * 64 KiB, far below what the ingest route accepts, and a browser refuses an
   * oversized one as a network failure this pipe cannot tell from being
   * offline (so the batch dies twice and is dropped, silently).
   */
  readonly final: boolean;
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
