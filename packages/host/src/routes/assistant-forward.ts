import type { ServerResponse } from "node:http";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import { json } from "./http";

/**
 * The gateway leg of the assistant dispatcher: one built request out, the
 * gateway's own answer back. Kept apart from the route so the route reads as
 * the decisions it makes (authenticate, configure, resolve) and this reads as
 * the single place a Houston operation actually leaves the pod.
 */

/** Where user-facing operations are performed, and the credential to do it. */
export interface AssistantGateway {
  /** Base URL of the gateway, no trailing slash. */
  url: string;
  token: string;
}

function upstreamUrl(
  gateway: AssistantGateway,
  request: AssistantUpstreamRequest,
): string {
  const url = new URL(`${gateway.url}${request.path}`);
  for (const [key, value] of Object.entries(request.query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Perform one operation and answer the caller with what the gateway said.
 * `actingAs` is the caller's already-verified acting identity, relayed so the
 * gateway authorizes the real person rather than the pod.
 */
export async function forwardAssistantCall(
  gateway: AssistantGateway,
  request: AssistantUpstreamRequest,
  context: {
    operation: string;
    actingAs: string | undefined;
    fetchImpl: typeof fetch;
  },
  res: ServerResponse,
): Promise<void> {
  const { operation, actingAs, fetchImpl } = context;
  let upstream: Response;
  try {
    upstream = await fetchImpl(upstreamUrl(gateway, request), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        ...(request.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(actingAs ? { [ACTING_AS_HEADER]: actingAs } : {}),
      },
      ...(request.body !== undefined
        ? { body: JSON.stringify(request.body) }
        : {}),
    });
  } catch (err) {
    console.error(`[assistant] ${operation} could not reach the gateway`, err);
    json(res, 502, {
      error: `could not reach Houston to perform "${operation}"`,
      code: "gateway_unreachable",
    });
    return;
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(
      `[assistant] ${operation} refused by the gateway (${upstream.status}): ${text.slice(0, 300)}`,
    );
    json(res, upstream.status, {
      error: text.slice(0, 300) || `gateway returned ${upstream.status}`,
      code: "gateway_error",
    });
    return;
  }
  // Relay the gateway's own JSON verbatim (an empty body stays empty — the
  // caller reads that as "no payload"). A 2xx that is NOT JSON means something
  // other than the gateway answered, which must not read as success.
  if (text !== "") {
    try {
      JSON.parse(text);
    } catch {
      console.error(
        `[assistant] ${operation} answered non-JSON on ${upstream.status}: ${text.slice(0, 300)}`,
      );
      json(res, 502, {
        error: `Houston answered something unreadable for "${operation}"`,
        code: "gateway_error",
      });
      return;
    }
  }
  res.writeHead(upstream.status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(text);
}
