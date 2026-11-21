import { trimTrailingSlashes } from "@houston/runtime-client/trim-slashes";
import {
  parseComputeRefusalText,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  retryAfterMsOf,
} from "@houston/wire-types";
import type { SdkPorts } from "../ports";
import { waitForRetry } from "./abortable-wait";

export interface HttpScope {
  baseUrl: string;
  ports: SdkPorts;
  onUnauthorized: () => void;
  fail: (message: string, status: number) => Error;
}

export class SdkHttpError extends Error {
  retryAfterMs: number | undefined = undefined;

  constructor(
    message: string,
    readonly status: number,
    name: string,
  ) {
    super(message);
    this.name = name;
  }
}

export interface ScopeContext {
  config: { baseUrl: string; ports: SdkPorts };
  authExpiry: { notifyExpired(): void };
}

export function moduleScope(
  ctx: ScopeContext,
  family: string,
  Failure: new (message: string, status: number) => SdkHttpError,
): HttpScope {
  return {
    baseUrl: trimTrailingSlashes(ctx.config.baseUrl),
    ports: ctx.config.ports,
    onUnauthorized: () => ctx.authExpiry.notifyExpired(),
    fail: (message, status) =>
      new Failure(message || `${family} request failed: ${status}`, status),
  };
}

export const COMPUTE_RETRY_BUDGET_MS = 20_000;
const COMPUTE_RETRY_DEFAULT_MS = 2_000;
const COMPUTE_RETRY_MIN_MS = 500;

export async function httpRequest(
  scope: HttpScope,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let paused = 0;
  const multipart =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  for (;;) {
    const res = await scope.ports.fetch(`${scope.baseUrl}${path}`, {
      ...init,
      headers: multipart
        ? init?.headers
        : { "Content-Type": "application/json", ...init?.headers },
    });
    if (res.ok) return res;
    if (res.status === 401) scope.onUnauthorized();
    const body = await res.text().catch(() => "");
    const retryAfterMs = retryAfterMsOf(res.headers);
    const pause = computeRetryPause(res.status, body, retryAfterMs, init);
    if (pause !== undefined && paused + pause <= COMPUTE_RETRY_BUDGET_MS) {
      paused += pause;
      await waitForRetry(scope.ports.clock, pause, init?.signal ?? undefined);
      continue;
    }
    const err = scope.fail(body, res.status);
    if (err instanceof SdkHttpError) err.retryAfterMs = retryAfterMs;
    throw err;
  }
}

function computeRetryPause(
  status: number,
  body: string,
  retryAfterMs: number | undefined,
  init: RequestInit | undefined,
): number | undefined {
  const method = (init?.method ?? "GET").toUpperCase();
  if (
    status !== 503 ||
    method === "GET" ||
    method === "HEAD" ||
    !(init?.body == null || typeof init.body === "string") ||
    (typeof init?.body === "string" &&
      utf8LengthExceeds(init.body, RESUMABLE_UPLOAD_THRESHOLD_BYTES))
  )
    return undefined;
  const refusal = parseComputeRefusalText(body);
  if (!refusal) return undefined;
  const hint = refusal.retryAfterMs ?? retryAfterMs ?? COMPUTE_RETRY_DEFAULT_MS;
  return Math.max(COMPUTE_RETRY_MIN_MS, hint);
}

function utf8LengthExceeds(text: string, limit: number): boolean {
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}
