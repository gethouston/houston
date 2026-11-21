import type { ProductEventName, ProductEventProps } from "./catalogue.ts";

export interface ProductAnalyticsEvent {
  readonly id: string;
  readonly name: ProductEventName;
  readonly ts: string;
  readonly properties: ProductEventProps;
}

export interface ProductAnalyticsContext {
  readonly session_id: string;
  readonly app_version: string;
  readonly platform: "desktop" | "web";
  readonly install_id?: string;
  readonly visitor_id?: string;
}

export interface RejectedProductEvent {
  readonly id: string;
  readonly reason: string;
}

export interface ProductAnalyticsSendOptions {
  readonly final: boolean;
}

export type ProductAnalyticsSendResult =
  | {
      readonly status: "ok";
      readonly rejected?: readonly RejectedProductEvent[];
    }
  | { readonly status: "no-session" }
  | { readonly status: "failed" };
