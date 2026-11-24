import type { ServerResponse } from "node:http";
import { parseComputeRefusalText } from "@houston/wire-types";
import { ACTING_AS_HEADER } from "../auth/acting";
import { assistantCallHeaders } from "../auth/assistant-call";
import type { AssistantUpstreamRequest } from "./assistant-dispatch";
import { json } from "./http";

export interface AssistantGateway {
  url: string;
  token: string;
  loopback?: true;
}

function upstreamUrl(
  gateway: AssistantGateway,
  request: AssistantUpstreamRequest,
): string | null {
  const base = new URL(gateway.url);
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(`${gateway.url}${request.path}`);
  } catch {
    return null;
  }
  if (url.pathname !== `${prefix}${request.path}`) return null;
  for (const [key, value] of Object.entries(request.query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export type ForwardOutcome = "performed" | "refused" | "unknown";

export async function forwardAssistantCall(
  gateway: AssistantGateway,
  request: AssistantUpstreamRequest,
  context: {
    operation: string;
    actingAs: string | undefined;
    fetchImpl: typeof fetch;
  },
  res: ServerResponse,
): Promise<ForwardOutcome> {
  const { operation, actingAs, fetchImpl } = context;
  const target = upstreamUrl(gateway, request);
  if (target === null) {
    console.error(
      `[assistant] ${operation} built an address that does not address it: ${request.path.slice(0, 300)}`,
    );
    json(res, 400, {
      error: `those values do not address "${operation}"`,
      code: "gateway_address",
    });
    return "refused";
  }
  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        ...(request.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(actingAs ? { [ACTING_AS_HEADER]: actingAs } : {}),
        ...(gateway.loopback ? assistantCallHeaders() : {}),
      },
      ...(request.body !== undefined
        ? { body: JSON.stringify(request.body) }
        : {}),
      ...(gateway.loopback ? { redirect: "manual" as const } : {}),
    });
  } catch (err) {
    console.error(`[assistant] ${operation} could not reach the gateway`, err);
    json(res, 502, {
      error: `could not reach the app to perform "${operation}"`,
      code: "gateway_unreachable",
    });
    return "unknown";
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error(
      `[assistant] ${operation} refused by the gateway (${upstream.status}): ${text.slice(0, 300)}`,
    );
    const refusal = parseComputeRefusalText(text);
    if (refusal) {
      json(res, upstream.status, refusal);
      return "refused";
    }
    const status =
      upstream.status >= 300 && upstream.status < 400 ? 502 : upstream.status;
    json(res, status, {
      error: text.slice(0, 300) || `gateway returned ${upstream.status}`,
      code: "gateway_error",
    });
    return upstream.status < 500 ? "refused" : "unknown";
  }
  if (text !== "") {
    try {
      JSON.parse(text);
    } catch {
      console.error(
        `[assistant] ${operation} answered non-JSON on ${upstream.status}: ${text.slice(0, 300)}`,
      );
      json(res, 502, {
        error: `the app answered something unreadable for "${operation}"`,
        code: "gateway_error",
      });
      return "unknown";
    }
  }
  res.writeHead(upstream.status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(text);
  return "performed";
}
