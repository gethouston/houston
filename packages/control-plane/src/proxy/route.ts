import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { ForwardRequest, RuntimeEndpoint } from "../ports";

/**
 * A transparent, content-negotiated reverse proxy from a control-plane client to
 * an agent's sandbox runtime.
 *
 * The control plane holds no per-agent state: every call under `/agents/:id/*`
 * (chat turns, the live SSE event stream, provider device-code login, settings)
 * is forwarded 1:1 to the runtime under the agent's own sandbox Bearer. A
 * `text/event-stream` response is piped byte-for-byte with no buffering,
 * transform, or idle-timeout — heartbeat comments (": hb") and `event:`/`data:`
 * frames cross verbatim. Any other response is relayed with its status and body
 * intact, so a runtime error (400/401/…) surfaces to the caller — never a silent
 * default. The control plane stays a dumb pipe, transparent to the wire protocol.
 */

/** Thrown when the sandbox runtime cannot be reached at all (no response to relay). */
export class ProxyError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`sandbox runtime request failed (${status}): ${body}`);
    this.name = "ProxyError";
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * Forward one authorized request to the agent's sandbox runtime and stream the
 * reply to `res`. Injects ONLY the sandbox Bearer (never the caller's Supabase
 * JWT). Resolves when the response is fully written or the client disconnects;
 * an unreachable upstream surfaces as a 502 (or destroys `res` if headers are
 * already flushed) and rethrows — never swallowed.
 */
export async function forward(
  endpoint: RuntimeEndpoint,
  request: ForwardRequest,
  res: ServerResponse,
): Promise<void> {
  const url = joinUrl(endpoint.baseUrl, request.path) + request.search;
  const method = request.method.toUpperCase();
  const bodyless = method === "GET" || method === "HEAD";

  // Abort the upstream fetch the instant the client disconnects — essential for
  // the long-lived SSE stream so the runtime sheds a dropped subscriber. Node
  // fires "close" on the ServerResponse, bun on the underlying IncomingMessage;
  // listen on both so it works under either runtime.
  const controller = new AbortController();
  const onClientClose = () => controller.abort();
  res.on("close", onClientClose);
  res.req.on("close", onClientClose);
  const detach = () => {
    res.removeListener("close", onClientClose);
    res.req.removeListener("close", onClientClose);
  };

  try {
    // Fresh headers: only the per-sandbox Bearer the runtime enforces, plus the
    // content-type for a forwarded body. The caller's own Authorization is never
    // relayed to the pod.
    const headers: Record<string, string> = { Authorization: `Bearer ${endpoint.token}` };
    if (!bodyless && request.contentType) headers["Content-Type"] = request.contentType;
    headers["Accept"] = request.path.endsWith("/events") ? "text/event-stream" : "application/json";

    // Retry on a pure CONNECTION failure only — the request never reached the
    // runtime, so a retry is safe even for a POST (no double-send). This covers the
    // brief window right after a cold boot when the pod is Ready but the Service's
    // endpoints haven't yet propagated to it ("Unable to connect"). A response of
    // ANY status (even an error) breaks the loop and is relayed as-is.
    let upstream: Response | undefined;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        upstream = await fetch(url, {
          method,
          headers,
          // A Buffer is a Uint8Array at runtime, but TS's BodyInit union doesn't
          // list Node's Buffer — hand fetch a plain Uint8Array view of the bytes.
          body: bodyless || !request.body ? undefined : new Uint8Array(request.body),
          signal: controller.signal,
        });
        break;
      } catch (err) {
        if (controller.signal.aborted) return; // client hung up
        if (attempt === 5) throw err; // out of retries → surfaces as 502
        await new Promise((r) => setTimeout(r, 400 * attempt)); // 0.4→1.6s backoff
      }
    }
    if (!upstream) return;

    const contentType = upstream.headers.get("content-type") ?? "";

    if (contentType.startsWith("text/event-stream")) {
      if (!upstream.body) throw new ProxyError(upstream.status, "no response body for event stream");
      // Reflect the runtime's SSE headers so intermediaries don't buffer it.
      res.writeHead(upstream.status, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const source = Readable.fromWeb(
        upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      // Dumb pipe: bytes only. Resolve when the upstream ends or the client hangs
      // up; surface a true stream error (an abort is a normal end).
      await new Promise<void>((resolve, reject) => {
        const onClientGone = () => {
          source.destroy();
          resolve();
        };
        res.on("close", onClientGone);
        res.req.on("close", onClientGone);
        source.pipe(res);
        source.on("end", resolve);
        source.on("error", (err) => {
          if (controller.signal.aborted) resolve();
          else reject(err);
        });
      });
      return;
    }

    // Ordinary (JSON/text) response: relay status + content-type + body verbatim
    // so a runtime 400/401/409 reaches the caller as itself, not a 502.
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type": contentType || "application/json; charset=utf-8",
    });
    res.end(buf);
  } catch (err) {
    // A client disconnect aborts the fetch — a normal end, not a failure.
    if (controller.signal.aborted) return;
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "sandbox proxy failed", detail: String(err) }));
    } else {
      res.destroy(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  } finally {
    detach();
  }
}
