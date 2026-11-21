import type { IncomingMessage } from "node:http";
import { parseTurnLimits, type TurnLimits } from "@houston/protocol";
import type { LiveTurnPin } from "./live-turn";
import { MAX_JSON_BYTES, readBody } from "./read-body";

export interface TurnBody {
  read(): Promise<Buffer>;
  replace(body: Buffer): void;
  peek(): Buffer | undefined;
}

export function turnBody(req: IncomingMessage): TurnBody {
  let buffer: Buffer | undefined;
  return {
    async read() {
      buffer ??= await readBody(req, MAX_JSON_BYTES);
      return buffer;
    },
    replace(body) {
      buffer = body;
    },
    peek() {
      return buffer;
    },
  };
}

export function turnModeOf(body: Buffer): unknown {
  try {
    return (JSON.parse(body.toString("utf8") || "{}") as { mode?: unknown })
      .mode;
  } catch {
    return undefined;
  }
}

export function turnPinOf(body: Buffer): LiveTurnPin | undefined {
  let parsed: { provider?: unknown; model?: unknown; effort?: unknown };
  try {
    parsed = JSON.parse(body.toString("utf8") || "{}") as typeof parsed;
  } catch {
    return undefined;
  }
  if (typeof parsed.provider !== "string" || !parsed.provider) return undefined;
  return {
    provider: parsed.provider,
    ...(typeof parsed.model === "string" && parsed.model
      ? { model: parsed.model }
      : {}),
    ...(typeof parsed.effort === "string" && parsed.effort
      ? { effort: parsed.effort }
      : {}),
  };
}

export function turnLimitsOf(body: Buffer): TurnLimits | undefined {
  try {
    const parsed = JSON.parse(body.toString("utf8") || "{}") as {
      limits?: unknown;
    };
    return parseTurnLimits(parsed?.limits);
  } catch {
    return undefined;
  }
}

export function parseTurnBody(body: Buffer): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  return parsed as Record<string, unknown>;
}
