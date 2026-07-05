/**
 * The bridge-fetch port: a `fetch`-shaped function whose HTTP work is performed
 * natively by the host and streamed back over the pipe.
 *
 * A request leaves as `fetch/start { id, url, method, headers, body? }`; the
 * host replies with `fetch/response { id, status, ok }` (which resolves the
 * `Response`), then zero or more `fetch/chunk { id, bytesBase64 }`, then a
 * terminal `fetch/done { id }` or `fetch/error { id, message }`. An
 * `AbortSignal` on the request sends `fetch/abort { id }` and fails the stream,
 * which is exactly how the runtime-client's resume loop detects a drop.
 *
 * Only the `Response` members the SDK consumes are assembled (see
 * `response.ts`). Request bodies are always UTF-8 strings on the bridge (the
 * SDK sends `JSON.stringify(...)` or nothing); a non-string body is coerced.
 */

import { base64ToBytes } from "./base64";
import { BridgeResponse, ByteStream } from "./response";
import type { BridgeOutbound, SendFn } from "./wire";

/** An abort surfaced to the SDK as a rejected fetch/read (name `AbortError`). */
function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

/** One in-flight bridge-fetch: its Response promise and its body stream. */
class PendingFetch {
  readonly response: Promise<Response>;
  private resolve!: (r: Response) => void;
  private reject!: (e: unknown) => void;
  private readonly stream = new ByteStream();
  private responded = false;
  /** Terminal (done/error/abort): the owner may drop it from the registry. */
  settled = false;

  constructor() {
    this.response = new Promise<Response>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }

  onResponse(status: number, ok: boolean): void {
    if (this.responded) return;
    this.responded = true;
    this.resolve(
      new BridgeResponse(status, ok, this.stream) as unknown as Response,
    );
  }

  onChunk(bytes: Uint8Array): void {
    this.stream.push(bytes);
  }

  onDone(): void {
    this.settled = true;
    this.stream.close();
  }

  onError(message: string): void {
    this.fail(new Error(message));
  }

  abort(): void {
    if (this.settled) return;
    this.fail(abortError());
  }

  private fail(err: Error): void {
    this.settled = true;
    if (!this.responded) {
      this.responded = true;
      this.reject(err);
    } else {
      this.stream.fail(err);
    }
  }
}

/** Whether `input` is a `Request` (guarded: the global may be a shim/absent). */
function isRequest(input: unknown): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

/** Resolve the request URL from any `fetch` first-argument form. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Flatten headers (Headers | record | entries) into a plain string map. */
function headerRecord(
  input: RequestInfo | URL,
  init?: RequestInit,
): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers ?? (isRequest(input) ? input.headers : undefined);
  if (!h) return out;
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v;
  } else if (typeof (h as Headers).forEach === "function") {
    (h as Headers).forEach((v, k) => {
      out[k] = v;
    });
  } else {
    for (const k of Object.keys(h))
      out[k] = String((h as Record<string, string>)[k]);
  }
  return out;
}

/** Build the `fetch/start` frame body for a request. */
function startFrame(
  id: string,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Extract<BridgeOutbound, { kind: "fetch/start" }> {
  const method = init?.method ?? (isRequest(input) ? input.method : "GET");
  const frame: Extract<BridgeOutbound, { kind: "fetch/start" }> = {
    kind: "fetch/start",
    id,
    url: urlOf(input),
    method,
    headers: headerRecord(input, init),
  };
  const body = init?.body;
  if (body != null) frame.body = typeof body === "string" ? body : String(body);
  return frame;
}

/** The fetch half of the port host: owns in-flight requests + routes replies. */
export class FetchPort {
  private readonly pending = new Map<string, PendingFetch>();

  constructor(
    private readonly send: SendFn,
    private readonly mintId: () => string,
  ) {}

  /** A `fetch`-shaped function routed over the pipe. */
  readonly fetch: typeof fetch = ((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const signal = init?.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(abortError());
    const id = this.mintId();
    const pending = new PendingFetch();
    this.pending.set(id, pending);
    this.send(JSON.stringify(startFrame(id, input, init)));
    if (signal) {
      const onAbort = () => {
        if (!pending.settled)
          this.send(JSON.stringify({ kind: "fetch/abort", id }));
        pending.abort();
        this.pending.delete(id);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
    return pending.response;
  }) as typeof fetch;

  /** Route a `fetch/*` reply frame. Returns whether it was a fetch frame. */
  handle(msg: Record<string, unknown>): boolean {
    const kind = msg.kind;
    if (typeof kind !== "string" || !kind.startsWith("fetch/")) return false;
    const id = typeof msg.id === "string" ? msg.id : "";
    const pending = this.pending.get(id);
    if (!pending) return true; // unknown/settled id: recognized frame, no target
    if (kind === "fetch/response") {
      pending.onResponse(Number(msg.status), msg.ok === true);
    } else if (kind === "fetch/chunk") {
      pending.onChunk(base64ToBytes(String(msg.bytesBase64 ?? "")));
    } else if (kind === "fetch/done") {
      pending.onDone();
      this.pending.delete(id);
    } else if (kind === "fetch/error") {
      pending.onError(String(msg.message ?? "fetch failed"));
      this.pending.delete(id);
    }
    return true;
  }

  /** Fail every in-flight request (SDK teardown). */
  dispose(): void {
    for (const pending of this.pending.values()) pending.abort();
    this.pending.clear();
  }
}
