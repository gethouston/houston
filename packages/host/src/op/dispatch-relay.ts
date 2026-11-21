import type { HoustonEvent } from "@houston/protocol";
import { MAX_UPLOAD_BYTES } from "../turn/files-import";
import type { LazyReadRefusedError } from "../vfs";
import type { AgentOpResponse } from "./dispatch";

const TEXT_BODY = /^application\/json/i;
const RELAYED_HEADERS = ["content-disposition", "cache-control"] as const;
export const TOO_LARGE_MESSAGE =
  "file too large to fetch while the agent sleeps";
export const PRIVATE_REFUSED_MESSAGE =
  "sign-in state is unavailable while the agent sleeps";
export const PRIVATE_REFUSED_CODE = "private_state_refused";

export function lazyRefusalBody(
  reason: LazyReadRefusedError["reason"],
): string {
  return JSON.stringify(
    reason === "private"
      ? { error: PRIVATE_REFUSED_MESSAGE, code: PRIVATE_REFUSED_CODE }
      : { error: TOO_LARGE_MESSAGE },
  );
}

export async function relayAgentOpResponse(
  response: Response,
  rest: string,
  events: HoustonEvent[],
): Promise<AgentOpResponse> {
  const contentType =
    response.headers.get("content-type") ?? "application/json";
  const headers: Record<string, string> = {};
  for (const name of RELAYED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  const relayed = Object.keys(headers).length > 0 ? { headers } : {};
  const binaryRoute = /^files\/(download|archive)$/.test(rest);
  if (!binaryRoute && TEXT_BODY.test(contentType)) {
    return {
      status: response.status,
      contentType,
      body: await response.text(),
      ...relayed,
      events,
    };
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) {
    await response.body?.cancel();
    return {
      tooLarge: true,
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: TOO_LARGE_MESSAGE }),
      events,
    };
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType,
    body: "",
    bodyBase64: bytes.toString("base64"),
    ...relayed,
    events,
  };
}
