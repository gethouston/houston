import type { ServerResponse } from "node:http";

/**
 * View docs: ENGINE-COMPUTED answers (not family files) published to the
 * managed doc store so the gateway can serve them while the pod is ASLEEP.
 * An asleep pod cannot change its own answer, so the last captured response
 * is exact until the next wake — and every awake serve refreshes it. This is
 * what turns the app's cold-open reads (`/providers` was observed at 8-11s,
 * a full pod wake) into a gateway read.
 */
export type ViewFamily = "providers" | "provider_usage" | "custom_definitions";

/** Route rest (after `/agents/:id/`) → the view family it publishes. */
export const VIEW_RESTS: Readonly<Record<string, ViewFamily>> = {
  providers: "providers",
  "providers/usage": "provider_usage",
  "integrations/custom/definitions": "custom_definitions",
};

const AGENT_PATH = /^\/agents\/([^/]+)\/(.+)$/;

/** Match a request path to a view route. Exact rest matches only. */
export function viewForPath(
  path: string,
): { agentId: string; family: ViewFamily } | null {
  const match = AGENT_PATH.exec(path);
  if (!match?.[1] || !match[2]) return null;
  const family = VIEW_RESTS[match[2]];
  return family ? { agentId: decodeURIComponent(match[1]), family } : null;
}

/** Views are small JSON bodies; anything larger is not a view answer. */
const CAPTURE_CAP_BYTES = 512 * 1024;

/**
 * Tee a response body without altering what the client receives. When the
 * response finishes 200 with a JSON content type and a parseable body under
 * the cap, `onJson` gets the parsed body. Anything else (error status,
 * over-cap, non-JSON) silently abandons the capture — the serve itself is
 * never affected.
 */
export function attachViewCapture(
  res: ServerResponse,
  onJson: (body: unknown) => void,
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let abandoned = false;
  const push = (chunk: unknown): void => {
    if (abandoned) return;
    if (typeof chunk === "string" || chunk instanceof Uint8Array) {
      const buf = Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > CAPTURE_CAP_BYTES) {
        abandoned = true;
        chunks.length = 0;
        return;
      }
      chunks.push(buf);
    }
  };
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  res.write = ((chunk: unknown, ...args: unknown[]) => {
    push(chunk);
    return (write as (...a: unknown[]) => boolean)(chunk, ...args);
  }) as typeof res.write;
  res.end = ((chunk?: unknown, ...args: unknown[]) => {
    if (chunk && typeof chunk !== "function") push(chunk);
    return (end as (...a: unknown[]) => ServerResponse)(chunk, ...args);
  }) as typeof res.end;
  res.once("finish", () => {
    if (abandoned || res.statusCode !== 200 || size === 0) return;
    // No content-type gate: headers passed to writeHead(status, headers) are
    // not observable via getHeader on every Node version. The matched routes
    // only serve JSON; a non-JSON body simply fails the parse and is dropped.
    try {
      onJson(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      // Not a JSON answer (or truncated) — nothing to publish.
    }
  });
}
