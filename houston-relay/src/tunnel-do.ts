// TunnelRoom Durable Object — per-tunnel state.
//
// One DO instance per `tunnelId`. Holds:
//   • one outbound WebSocket FROM the desktop engine (the "tunnel")
//   • zero-or-more inbound WebSockets FROM mobile clients
//   • a pending-HTTP-request table keyed by reqId
//
// All mobile traffic multiplexes onto the desktop link via framed messages.
// Frame spec lives in ./types.ts and MUST stay in lock-step with the Rust
// side (engine/houston-tunnel/src/frame.rs).
//
// Operational notes:
//   • Concurrent in-flight mobile HTTP requests are capped at MAX_INFLIGHT.
//     Beyond that, the relay returns 429.
//   • If the desktop leg drops, every inbound mobile request resolves to 503
//     immediately (no waiting for a reconnect — mobile shows an offline banner).
//   • The DO keeps no long-term storage today; identity lives in R2/KV.

import type {
  HttpRequestFrame,
  HttpResponseFrame,
  PairRequestFrame,
  PairResponseFrame,
  PingFrame,
  PongFrame,
  TunnelFrame,
  WsCloseFrame,
  WsMessageFrame,
  WsOpenAckFrame,
  WsOpenFrame,
} from "./types";

const MAX_INFLIGHT = 64;
const REQUEST_TIMEOUT_MS = 30_000;
const DESKTOP_HEARTBEAT_MS = 20_000;
/** If no frame at all has arrived from the desktop in this window, its
 * WS is considered dead even if TCP/WS layers haven't noticed. We force
 * a close so the engine's outer reconnect loop gets a fresh handshake.
 * Must be > desktop's heartbeat (30s) + network jitter. */
const DESKTOP_WATCHDOG_MS = 75_000;

type PendingHttp = {
  resolve: (res: Response) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingPair = {
  resolve: (frame: PairResponseFrame) => void;
  timer: ReturnType<typeof setTimeout>;
};

// Tag values for `ws.serializeAttachment()` — survives hibernation.
interface WsTag {
  role: "desktop" | "mobile";
  wsId?: string; // mobile legs only
}

export class TunnelRoom implements DurableObject {
  private desktop: WebSocket | null = null;
  private pendingHttp = new Map<string, PendingHttp>();
  private pendingPair = new Map<string, PendingPair>();
  /** Mobile WS legs keyed by wsId. */
  private mobileSockets = new Map<string, WebSocket>();
  /** Last inbound frame of ANY kind from the desktop. Any traffic resets
   * this; no-traffic windows above `DESKTOP_WATCHDOG_MS` trip the
   * watchdog in `alarm()`. */
  private lastDesktopActivity = 0;

  constructor(
    private readonly state: DurableObjectState,
    env: unknown,
  ) {
    void env;
    // Restore in-memory indices from any hibernated WSs. This is the
    // critical bit — without it, `this.desktop` is null on wake-up even
    // though the WebSocket itself survives.
    for (const ws of state.getWebSockets()) {
      const tag = ws.deserializeAttachment() as WsTag | null;
      if (!tag) continue;
      if (tag.role === "desktop") this.desktop = ws;
      else if (tag.role === "mobile" && tag.wsId)
        this.mobileSockets.set(tag.wsId, ws);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // segments after /e/:tunnelId — so segments[0] == tunnelId; we ignore here.
    const action = segments[2] ?? "";

    // 1) Desktop is dialing us to register this tunnel.
    if (
      action === "register" &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      return this.handleDesktopRegister(request);
    }

    // 2) Mobile opening the engine WS via tunnel.
    if (
      action === "v1" &&
      segments[3] === "ws" &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      return this.handleMobileWs(request);
    }

    // 3) Any other path under /e/:tunnelId/v1/* is an HTTP proxy call.
    // Preserve the query string (e.g. some routes use `?token=` for auth).
    if (action === "v1") {
      const pathWithQuery = `/${segments.slice(2).join("/")}${url.search}`;
      return this.handleProxyHttp(request, pathWithQuery);
    }

    // 4) Pair request (HTTP from mobile-facing worker to DO).
    if (action === "pair") {
      return this.handlePairRequest(request);
    }

    // 5) Tunnel status query (HTTP from worker).
    if (action === "status") {
      return Response.json({
        connected: !!this.desktop,
        inflight: this.pendingHttp.size,
        mobileSockets: this.mobileSockets.size,
        lastDesktopActivity: this.lastDesktopActivity,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // ---------------------------------------------------------------------
  // Desktop registration
  // ---------------------------------------------------------------------

  private async handleDesktopRegister(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (this.desktop) {
      // Only one desktop per tunnel. Kick the old one so restarts don't
      // leave zombies holding the slot.
      try {
        this.desktop.close(4000, "replaced by new desktop registration");
      } catch {
        /* ignore */
      }
      this.failAllPending(503, "desktop reconnected");
    }

    // Hibernation-ready accept: this WS keeps its attachment across
    // DO sleep/wake cycles and is redelivered on `webSocketMessage` /
    // `webSocketClose`. Without this, `this.desktop` would vanish as
    // soon as the DO hibernated after the handshake.
    this.state.acceptWebSocket(server, ["desktop"]);
    server.serializeAttachment({ role: "desktop" } satisfies WsTag);
    this.desktop = server;
    this.lastDesktopActivity = Date.now();

    // Periodic heartbeat so long-idle tunnels stay warm.
    this.state.storage.setAlarm(Date.now() + DESKTOP_HEARTBEAT_MS);

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Hibernation API entry point — replaces the old addEventListener pattern. */
  webSocketMessage(
    ws: WebSocket,
    message: ArrayBuffer | string,
  ): void | Promise<void> {
    const tag = ws.deserializeAttachment() as WsTag | null;
    if (!tag) return;
    if (tag.role === "desktop") {
      this.onDesktopMessage({ data: message } as MessageEvent);
      return;
    }
    if (tag.role === "mobile" && tag.wsId) {
      this.onMobileMessage(tag.wsId, message);
    }
  }

  webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): void | Promise<void> {
    const tag = ws.deserializeAttachment() as WsTag | null;
    if (!tag) return;
    if (tag.role === "desktop") {
      this.onDesktopClose();
      return;
    }
    if (tag.role === "mobile" && tag.wsId) {
      this.mobileSockets.delete(tag.wsId);
      this.sendToDesktop({
        kind: "ws_close",
        wsId: tag.wsId,
        code,
        reason,
      } satisfies WsCloseFrame);
    }
  }

  async alarm(): Promise<void> {
    if (!this.desktop) return;
    const silence = Date.now() - this.lastDesktopActivity;
    if (silence > DESKTOP_WATCHDOG_MS) {
      // Watchdog fired — desktop hasn't sent anything in the silence
      // window. Could be a half-open TCP, frozen process, machine sleep.
      // Close it; the engine will reconnect and we'll mint a fresh DO
      // slot. Without this, mobile would keep getting 503s indefinitely.
      console.warn(
        `[tunnel-do] watchdog: desktop silent ${silence}ms, closing`,
      );
      try {
        this.desktop.close(1011, "watchdog: no frame from desktop");
      } catch {
        /* ignore */
      }
      this.onDesktopClose();
      return;
    }
    try {
      const ping: PingFrame = { kind: "ping", ts: Date.now() };
      this.desktop.send(JSON.stringify(ping));
    } catch {
      /* ignore */
    }
    this.state.storage.setAlarm(Date.now() + DESKTOP_HEARTBEAT_MS);
  }

  private onMobileMessage(wsId: string, message: ArrayBuffer | string): void {
    const msg: WsMessageFrame = {
      kind: "ws_message",
      wsId,
      dir: "c2s",
      text: typeof message === "string" ? message : undefined,
      binary:
        typeof message === "string"
          ? undefined
          : b64Encode(new Uint8Array(message)),
    };
    this.sendToDesktop(msg);
  }

  private onDesktopMessage(ev: MessageEvent) {
    // ANY inbound frame counts as liveness. Do this BEFORE the kind
    // switch so even unknown / future frames keep the watchdog happy.
    this.lastDesktopActivity = Date.now();

    let frame: TunnelFrame;
    try {
      frame = JSON.parse(ev.data as string);
    } catch {
      return;
    }

    switch (frame.kind) {
      case "http_response":
        this.resolveHttp(frame);
        return;
      case "pair_response":
        this.resolvePair(frame);
        return;
      case "ws_open_ack":
        this.onWsOpenAck(frame);
        return;
      case "ws_message":
        this.onWsMessageFromDesktop(frame);
        return;
      case "ws_close":
        this.onWsCloseFromDesktop(frame);
        return;
      case "pong":
        /* already bumped lastDesktopActivity above */
        return;
      case "ping":
        // Respond so desktop can also measure rtt.
        this.sendToDesktop({ kind: "pong", ts: frame.ts } satisfies PongFrame);
        return;
      default:
        /* unknown frame — ignore */
        return;
    }
  }

  private onDesktopClose() {
    this.desktop = null;
    this.failAllPending(503, "desktop disconnected");
    for (const sock of this.mobileSockets.values()) {
      try {
        sock.close(1011, "desktop tunnel closed");
      } catch {
        /* ignore */
      }
    }
    this.mobileSockets.clear();
  }

  private failAllPending(_status: number, reason: string) {
    for (const { resolve, timer } of this.pendingHttp.values()) {
      clearTimeout(timer);
      resolve(new Response(reason, { status: 503 }));
    }
    this.pendingHttp.clear();
    for (const { resolve, timer } of this.pendingPair.values()) {
      clearTimeout(timer);
      resolve({
        kind: "pair_response",
        reqId: "",
        ok: false,
        error: reason,
      });
    }
    this.pendingPair.clear();
  }

  private sendToDesktop(frame: TunnelFrame): boolean {
    if (!this.desktop) return false;
    try {
      this.desktop.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // HTTP proxy
  // ---------------------------------------------------------------------

  private async handleProxyHttp(
    request: Request,
    path: string,
  ): Promise<Response> {
    if (!this.desktop) {
      return new Response("desktop offline", { status: 503 });
    }
    if (this.pendingHttp.size >= MAX_INFLIGHT) {
      return new Response("too many in-flight requests", { status: 429 });
    }

    const reqId = crypto.randomUUID();
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      // Strip hop-by-hop headers before proxying.
      if (
        /^(?:connection|upgrade|keep-alive|proxy-.*|te|trailer|transfer-encoding)$/i.test(
          k,
        )
      ) {
        return;
      }
      headers[k] = v;
    });

    const body = request.body ? await request.arrayBuffer() : null;
    const frame: HttpRequestFrame = {
      kind: "http_request",
      reqId,
      method: request.method,
      path,
      headers,
      body: body ? b64Encode(new Uint8Array(body)) : null,
    };

    return await new Promise<Response>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingHttp.delete(reqId)) {
          resolve(new Response("tunnel timeout", { status: 504 }));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pendingHttp.set(reqId, { resolve, timer });
      if (!this.sendToDesktop(frame)) {
        clearTimeout(timer);
        this.pendingHttp.delete(reqId);
        resolve(new Response("send failed", { status: 502 }));
      }
    });
  }

  private resolveHttp(frame: HttpResponseFrame) {
    const pending = this.pendingHttp.get(frame.reqId);
    if (!pending) return;
    this.pendingHttp.delete(frame.reqId);
    clearTimeout(pending.timer);

    const body = frame.body ? b64Decode(frame.body) : null;
    const headers = new Headers();
    for (const [k, v] of Object.entries(frame.headers)) {
      headers.set(k, v);
    }
    // Uint8Array → ArrayBuffer cast for Response (Workers' BodyInit).
    pending.resolve(
      new Response(body ? (body.buffer as ArrayBuffer) : null, {
        status: frame.status,
        headers,
      }),
    );
  }

  // ---------------------------------------------------------------------
  // WebSocket proxy (mobile <-> desktop engine /v1/ws)
  // ---------------------------------------------------------------------

  private async handleMobileWs(request: Request): Promise<Response> {
    if (!this.desktop) {
      return new Response("desktop offline", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const wsId = crypto.randomUUID();
    this.state.acceptWebSocket(server, ["mobile", wsId]);
    server.serializeAttachment({ role: "mobile", wsId } satisfies WsTag);
    this.mobileSockets.set(wsId, server);

    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k] = v;
    });

    // Forward the FULL path + query so the engine sees `?token=<...>`.
    // Without this, auth 401s every mobile WS and real-time invalidation
    // never fires. Strip the `/e/<tunnelId>` prefix so what reaches the
    // engine matches its router ("/v1/ws?token=...").
    const fwdUrl = new URL(request.url);
    const forwardPath =
      fwdUrl.pathname.replace(/^\/e\/[^/]+/, "") + fwdUrl.search;

    this.sendToDesktop({
      kind: "ws_open",
      wsId,
      path: forwardPath || "/v1/ws",
      headers,
    } satisfies WsOpenFrame);

    return new Response(null, { status: 101, webSocket: client });
  }

  private onWsOpenAck(frame: WsOpenAckFrame) {
    if (frame.ok) return;
    const sock = this.mobileSockets.get(frame.wsId);
    if (!sock) return;
    this.mobileSockets.delete(frame.wsId);
    try {
      sock.close(1011, frame.error ?? "desktop refused WS");
    } catch {
      /* ignore */
    }
  }

  private onWsMessageFromDesktop(frame: WsMessageFrame) {
    if (frame.dir !== "s2c") return;
    const sock = this.mobileSockets.get(frame.wsId);
    if (!sock) return;
    try {
      if (frame.text !== undefined) {
        sock.send(frame.text);
      } else if (frame.binary !== undefined) {
        sock.send(b64Decode(frame.binary));
      }
    } catch {
      /* ignore */
    }
  }

  private onWsCloseFromDesktop(frame: WsCloseFrame) {
    const sock = this.mobileSockets.get(frame.wsId);
    if (!sock) return;
    this.mobileSockets.delete(frame.wsId);
    try {
      sock.close(frame.code ?? 1000, frame.reason ?? "");
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------
  // Pairing
  // ---------------------------------------------------------------------

  private async handlePairRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    if (!this.desktop) {
      return Response.json(
        { ok: false, code: "desktop_offline", error: "desktop offline" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      code: string;
      deviceLabel?: string;
    };
    if (!body?.code) {
      return Response.json(
        { ok: false, code: "code_malformed", error: "missing code" },
        { status: 400 },
      );
    }

    const reqId = crypto.randomUUID();
    const frame: PairRequestFrame = {
      kind: "pair_request",
      reqId,
      code: body.code,
      deviceLabel: body.deviceLabel ?? "iPhone",
    };

    const response = await new Promise<PairResponseFrame>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingPair.delete(reqId)) {
          resolve({
            kind: "pair_response",
            reqId,
            ok: false,
            error: "pair timeout",
            code: "pair_timeout",
          });
        }
      }, 10_000);
      this.pendingPair.set(reqId, { resolve, timer });
      if (!this.sendToDesktop(frame)) {
        clearTimeout(timer);
        this.pendingPair.delete(reqId);
        resolve({
          kind: "pair_response",
          reqId,
          ok: false,
          error: "send to desktop failed",
          code: "desktop_offline",
        });
      }
    });

    if (!response.ok || !response.engineToken) {
      // 503 for transport-level transients (retryable on mobile); 400 for
      // definitive engine rejections (don't retry — code is bad).
      const code = response.code ?? "internal";
      const httpStatus =
        code === "desktop_offline" || code === "pair_timeout" ? 503 : 400;
      return Response.json(
        { ok: false, code, error: response.error ?? "pair failed" },
        { status: httpStatus },
      );
    }
    return Response.json({
      ok: true,
      engineToken: response.engineToken,
      deviceLabel: body.deviceLabel ?? "iPhone",
    });
  }

  private resolvePair(frame: PairResponseFrame) {
    const pending = this.pendingPair.get(frame.reqId);
    if (!pending) return;
    this.pendingPair.delete(frame.reqId);
    clearTimeout(pending.timer);
    pending.resolve(frame);
  }
}

// ---------------------------------------------------------------------
// base64 helpers — Workers lack Buffer, so do it with atob/btoa.
// ---------------------------------------------------------------------

function b64Encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
function b64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
