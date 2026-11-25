import type { ServerResponse } from "node:http";
import type { ForwardRequest, RuntimeEndpoint } from "../ports";

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

// WHY: Under Bun, pipe buffers SSE and the done frame never arrives; write each chunk. ADR-0016
export async function forward(
  endpoint: RuntimeEndpoint,
  request: ForwardRequest,
  res: ServerResponse,
): Promise<void> {
  const url = joinUrl(endpoint.baseUrl, request.path) + request.search;
  const method = request.method.toUpperCase();
  const bodyless = method === "GET" || method === "HEAD";

  const controller = new AbortController();
  const onClientClose = () => controller.abort();
  res.on("close", onClientClose);
  res.req.on("close", onClientClose);
  const detach = () => {
    res.removeListener("close", onClientClose);
    res.req.removeListener("close", onClientClose);
  };

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${endpoint.token}`,
    };
    if (!bodyless && request.contentType)
      headers["Content-Type"] = request.contentType;
    if (request.actingAs) headers["x-houston-acting-as"] = request.actingAs;
    if (request.lastEventId) headers["Last-Event-ID"] = request.lastEventId;
    headers.Accept = request.path.endsWith("/events")
      ? "text/event-stream"
      : "application/json";

    let upstream: Response | undefined;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        upstream = await fetch(url, {
          method,
          headers,
          body:
            bodyless || !request.body
              ? undefined
              : new Uint8Array(request.body),
          signal: controller.signal,
        });
        break;
      } catch (err) {
        if (controller.signal.aborted) return;
        if (attempt === 5) throw err;
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (!upstream) return;

    const contentType = upstream.headers.get("content-type") ?? "";

    if (contentType.startsWith("text/event-stream")) {
      if (!upstream.body)
        throw new ProxyError(
          upstream.status,
          "no response body for event stream",
        );
      res.writeHead(upstream.status, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.socket?.setNoDelay?.(true);
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && !res.writableEnded) res.write(value);
        }
      } catch (err) {
        if (!controller.signal.aborted) throw err;
      } finally {
        reader.releaseLock();
      }
      if (!res.writableEnded) res.end();
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type": contentType || "application/json; charset=utf-8",
    });
    res.end(buf);
  } catch (err) {
    if (controller.signal.aborted) return;
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({ error: "sandbox proxy failed", detail: String(err) }),
      );
    } else {
      res.destroy(err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  } finally {
    detach();
  }
}
