// Shared types for the Houston relay.
//
// The relay is a reverse-tunnel proxy: the desktop engine opens one
// outbound WebSocket to a Durable Object; inbound HTTP + WS from
// mobile gets framed and carried over that single link, multiplexed
// by `reqId`.
//
// This file is the source of truth for the wire envelope. The Rust
// side (engine/houston-tunnel) must stay in lock-step.

export interface Env {
  TUNNEL: DurableObjectNamespace;
  /** Static-asset binding that serves the mobile PWA bundle from the
   * same origin as the tunnel API. Routed via `env.ASSETS.fetch(req)`
   * for any path the Worker doesn't claim. Lives in `mobile/dist/`
   * after `bun run --filter mobile build`. */
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  RELAY_PUBLIC_HOST: string;

  // Secrets (wrangler secret put):
  TUNNEL_SHARED_SECRET?: string;
}

// ---------------------------------------------------------------------------
// Tunnel frame protocol (DO <-> desktop engine over the single outbound WS)
// ---------------------------------------------------------------------------

export type TunnelFrame =
  | HttpRequestFrame
  | HttpResponseFrame
  | WsOpenFrame
  | WsOpenAckFrame
  | WsMessageFrame
  | WsCloseFrame
  | PairRequestFrame
  | PairResponseFrame
  | PingFrame
  | PongFrame;

/** Mobile → desktop: proxy an HTTP request. */
export interface HttpRequestFrame {
  kind: "http_request";
  reqId: string;
  method: string;
  path: string; // always starts with /v1/...
  headers: Record<string, string>;
  /** Body as base64 (null for empty). */
  body: string | null;
}

/** Desktop → mobile: proxied HTTP response. */
export interface HttpResponseFrame {
  kind: "http_response";
  reqId: string;
  status: number;
  headers: Record<string, string>;
  body: string | null; // base64
}

/** Mobile WS upgrade → desktop: open a local WS to engine. */
export interface WsOpenFrame {
  kind: "ws_open";
  wsId: string;
  path: string;
  headers: Record<string, string>;
}

/** Desktop → mobile: result of opening the local WS. */
export interface WsOpenAckFrame {
  kind: "ws_open_ack";
  wsId: string;
  ok: boolean;
  status?: number;
  error?: string;
}

/** Bi-directional WS message frame. `dir` indicates sender. */
export interface WsMessageFrame {
  kind: "ws_message";
  wsId: string;
  /** "c2s" = mobile → desktop engine; "s2c" = desktop engine → mobile. */
  dir: "c2s" | "s2c";
  /** Text or binary. Binary is base64. */
  text?: string;
  binary?: string;
}

/** Either side closing the WS leg. */
export interface WsCloseFrame {
  kind: "ws_close";
  wsId: string;
  code?: number;
  reason?: string;
}

/** Mobile → desktop: phone access exchange. Desktop mints a device token. */
export interface PairRequestFrame {
  kind: "pair_request";
  reqId: string;
  code: string;
  deviceLabel: string;
}

/** Desktop → mobile: pairing result. */
export interface PairResponseFrame {
  kind: "pair_response";
  reqId: string;
  ok: boolean;
  engineToken?: string;
  /** Human-friendly fallback. Clients should prefer `code`. */
  error?: string;
  /** Machine-readable failure classification. Always present on ok=false. */
  code?: PairErrorCode;
}

/** Canonical failure codes surfaced in pair flow responses. Mobile
 * maps each to a user-facing string; `code` is the contract, `error`
 * is just a debug hint. New codes require a mobile `friendlyError`
 * update. */
export type PairErrorCode =
  | "desktop_offline" // DO has no desktop WS right now
  | "pair_timeout" // desktop didn't respond within pair window
  | "code_unknown" // engine does not recognize this access secret
  | "code_malformed" // relay couldn't parse the code
  | "internal" // engine-side unexpected failure
  | "network"; // client-side fetch throw (never sent by server)

/** Keep-alive; either side may initiate. */
export interface PingFrame {
  kind: "ping";
  ts: number;
}
export interface PongFrame {
  kind: "pong";
  ts: number;
}

// ---------------------------------------------------------------------------
// Allocation (first-boot): engine asks relay for {tunnelId, tunnelToken}
// ---------------------------------------------------------------------------

export interface AllocateResponse {
  tunnelId: string;
  tunnelToken: string;
  publicHost: string;
}
