import type { ServerResponse } from "node:http";
import { listRoutes } from "../routes/registry/all";

export type ViewFamily =
  | "providers"
  | "provider_usage"
  | "custom_definitions"
  | "skills";

const VIEW_ROUTES = {
  providers: "providers",
  provider_usage: "providers/usage",
  custom_definitions: "integrations/custom/definitions",
  skills: "skills",
} as const satisfies Record<ViewFamily, string>;

const AGENT_PREFIX = "/agents/:agentId/";

export const VIEW_RESTS: Readonly<Record<string, ViewFamily>> =
  Object.fromEntries(
    Object.entries(VIEW_ROUTES).map(([family, rest]) => {
      const declared = listRoutes().some(
        (route) =>
          route.phase === "agent" &&
          route.method === "GET" &&
          route.path === `${AGENT_PREFIX}${rest}`,
      );
      if (!declared)
        throw new Error(
          `view family "${family}" captures GET ${AGENT_PREFIX}${rest}, which no route declares`,
        );
      return [rest, family as ViewFamily];
    }),
  );

const AGENT_PATH = /^\/agents\/([^/]+)\/(.+)$/;

export function viewForPath(
  path: string,
): { agentId: string; family: ViewFamily } | null {
  const match = AGENT_PATH.exec(path);
  if (!match?.[1] || !match[2]) return null;
  const family = VIEW_RESTS[match[2]];
  return family ? { agentId: decodeURIComponent(match[1]), family } : null;
}

const CAPTURE_CAP_BYTES = 4 * 1024 * 1024;

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
    try {
      onJson(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {}
  });
}
