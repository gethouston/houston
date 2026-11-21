import {
  SLACK_LOOPBACK_MAX_PORT,
  SLACK_LOOPBACK_MIN_PORT,
  SLACK_LOOPBACK_STATE,
  type SlackConnectReturn,
} from "@houston/wire-types";
import { refusalCode, refusalStatus } from "../refusal-code";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("'returnTo' must be an object when given");
  }
  return value as Record<string, unknown>;
}

export function parseSlackConnectReturn(
  value: unknown,
): SlackConnectReturn | undefined {
  if (value === undefined || value === null) return undefined;
  const target = record(value);
  if (target.kind === "app") return { kind: "app" };
  if (target.kind !== "loopback") {
    throw new Error("'returnTo.kind' must be app or loopback");
  }
  const { port, state } = target;
  if (
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < SLACK_LOOPBACK_MIN_PORT ||
    port > SLACK_LOOPBACK_MAX_PORT
  ) {
    throw new Error(
      `'returnTo.port' must be an integer ${SLACK_LOOPBACK_MIN_PORT}-${SLACK_LOOPBACK_MAX_PORT}`,
    );
  }
  if (typeof state !== "string" || !SLACK_LOOPBACK_STATE.test(state)) {
    throw new Error("'returnTo.state' must be a 16-128 character nonce");
  }
  return { kind: "loopback", port, state };
}

export function gatewayRefusedLoopback(
  returnTo: SlackConnectReturn | undefined,
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return (
    returnTo?.kind === "loopback" &&
    signal?.aborted !== true &&
    error instanceof Error &&
    refusalStatus(error) === 400 &&
    refusalCode(error) === "invalid_request"
  );
}
