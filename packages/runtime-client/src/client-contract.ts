import type { WireFrame } from "./types";

export interface EventStreamOptions {
  signal?: AbortSignal;
  after?: number;
  onEvent: (event: WireFrame) => void;
  onActivity?: () => void;
}

export interface SendOptions {
  nonce?: string;
  provider?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
  displayText?: string;
  mentions?: { userId: string; name?: string }[];
  approvals?: { requestId: string; decision: "approve" | "deny" }[];
  missionTitle?: { fallback: string; text: string };
  grants?: "createAgent"[];
  signal?: AbortSignal;
}

export interface SendAccepted {
  turnId?: string;
}

export function parseSendAccepted(text: string): SendAccepted {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return {};
  }
  const turnId =
    typeof body === "object" && body !== null
      ? (body as { turnId?: unknown }).turnId
      : undefined;
  return typeof turnId === "string" && turnId !== "" ? { turnId } : {};
}
