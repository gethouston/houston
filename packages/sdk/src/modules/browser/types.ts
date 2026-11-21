import type {
  BrowserHandoffEnd,
  BrowserHandoffState,
  BrowserLiveFrame,
  BrowserLiveInput,
  BrowserLiveLayout,
} from "@houston/wire-types";

export type BrowserLiveConnectionState =
  | { kind: "connecting" }
  | { kind: "live" }
  | { kind: "reconnecting"; attempt: number }
  | { kind: "lost" }
  | { kind: "ended"; reason: BrowserHandoffEnd | "none" | "not_owner" };

export interface BrowserLiveHandlers {
  onFrame(frame: BrowserLiveFrame): void;
  onPage(page: { url: string; title: string }): void;
  onStatus(status: {
    state: BrowserHandoffState;
    text: string;
    expiresAt: number;
  }): void;
  onConnection(state: BrowserLiveConnectionState): void;
  onRefused(code: "url_refused"): void;
  onUnexpected(error: unknown): void;
}

export type BrowserLiveFinishResult = "answered" | "abandoned";

export interface BrowserLiveConnection {
  send(event: BrowserLiveInput): void;
  finish(outcome: "done" | "cancel"): Promise<BrowserLiveFinishResult>;
  setLayout(layout: BrowserLiveLayout): void;
  retry(): void;
  close(): void;
}

export interface BrowserLiveConnectOptions {
  layout?: BrowserLiveLayout;
}
