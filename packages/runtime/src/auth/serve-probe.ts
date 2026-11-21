import { PROVIDER_ACCOUNT_BLOCKED_CODE } from "@houston/protocol";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import type { ServedCredential } from "./auth-file";
import { authFailureActive } from "./credential-health";

export type ServeProbe =
  | { id: string; state: "served"; cred: ServedCredential }
  | { id: string; state: "not-connected"; notServedHere?: boolean }
  | {
      id: string;
      state: "error";
      detail: string;
      timedOut?: boolean;
      blocked?: true;
    };

const NOT_CONNECTED_HEADER = "x-houston-not-connected";

const NOT_SERVED_HERE_HEADER = "x-houston-not-served-here";

const SERVE_FETCH_TIMEOUT_MS = 10_000;

export const PROBE_RETRY_DELAY_MS = 250;

export const PROBE_CONCURRENCY = 8;

function causeCode(err: unknown, depth = 0): string | undefined {
  if (!err || typeof err !== "object" || depth > 4) return undefined;
  const e = err as {
    code?: unknown;
    errno?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  if (typeof e.code === "string" && e.code) return e.code;
  if (typeof e.errno === "number") return String(e.errno);
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) {
      const code = causeCode(inner, depth + 1);
      if (code) return code;
    }
  }
  return causeCode(e.cause, depth + 1);
}

export function normalizeProbeDetail(id: string, body: string): string {
  return body.split(id).join("<provider>");
}

export function describeProbeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = causeCode(err.cause);
  return code ? `${err.message} (cause: ${code})` : err.message;
}

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

export function probePath(id: string, fresh: boolean): string {
  return `/sandbox/credential?provider=${id}${fresh ? "&fresh=1" : ""}`;
}

async function probeOnce(id: string): Promise<ServeProbe> {
  const { actingAs } = currentCredentialScope();
  try {
    const res = await fetch(
      `${config.controlPlaneUrl}${probePath(id, authFailureActive(id))}`,
      {
        headers: {
          Authorization: `Bearer ${config.sandboxToken}`,
          ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
        },
        signal: AbortSignal.timeout(SERVE_FETCH_TIMEOUT_MS),
      },
    );
    if (res.status === 404 && res.headers.get(NOT_CONNECTED_HEADER) === "1")
      return {
        id,
        state: "not-connected",
        ...(res.headers.get(NOT_SERVED_HERE_HEADER) === "1"
          ? { notServedHere: true }
          : {}),
      };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        id,
        state: "error",
        detail: `${res.status}: ${normalizeProbeDetail(id, body)}`,
        ...(res.status === 502 && isAccountBlockedBody(body)
          ? { blocked: true as const }
          : {}),
      };
    }
    return {
      id,
      state: "served",
      cred: (await res.json()) as ServedCredential,
    };
  } catch (err) {
    return {
      id,
      state: "error",
      detail: describeProbeError(err),
      timedOut: isTimeout(err),
    };
  }
}

function isAccountBlockedBody(body: string): boolean {
  try {
    return (
      (JSON.parse(body) as { code?: unknown }).code ===
      PROVIDER_ACCOUNT_BLOCKED_CODE
    );
  } catch {
    return false;
  }
}

export async function probeProvider(
  id: string,
  attempt: (id: string) => Promise<ServeProbe> = probeOnce,
  retryDelayMs: number = PROBE_RETRY_DELAY_MS,
): Promise<ServeProbe> {
  const first = await attempt(id);
  if (first.state !== "error" || first.timedOut || first.blocked) return first;
  console.warn(
    `[serve] credential ${id} probe failed, retrying once: ${first.detail}`,
  );
  await new Promise((r) => setTimeout(r, retryDelayMs));
  return attempt(id);
}

export async function probeProviders(
  ids: string[],
  probe: (id: string) => Promise<ServeProbe> = probeProvider,
  concurrency: number = PROBE_CONCURRENCY,
): Promise<ServeProbe[]> {
  const results: ServeProbe[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, ids.length)) },
    async () => {
      while (next < ids.length) {
        const index = next++;
        const id = ids[index];
        if (id !== undefined) results[index] = await probe(id);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function anthropicServedVerdict(probe: ServeProbe): boolean | undefined {
  if (probe.id !== "anthropic" || probe.state === "error") return undefined;
  return !(probe.state === "not-connected" && probe.notServedHere === true);
}
