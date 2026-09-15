import { createControlPlaneServer } from "../server";
import { type ProbeCase, probeCases } from "./route-probes";
import {
  close,
  fenceOutboundFetch,
  listen,
  type ReplayHost,
  replayHost,
} from "./route-replay-host";

/** What one probe pins. Everything here is stable across runs by construction. */
export interface ProbeRecord {
  status: number | "timeout";
  contentType: string | null;
  /** The `error` field of a JSON body — the chain's own failure vocabulary. */
  errorCode: string | null;
  /** Sorted keys of a JSON object body, `["<array>"]` for an array, else null. */
  bodyKeys: string[] | null;
  /** `"METHOD rest"` the recording runtime proxy saw — WHICH handler won. */
  forwarded: string | null;
}

const EMPTY_BODY = { errorCode: null, bodyKeys: null } as const;

const AUTH_HEADERS: Record<ProbeCase["auth"], Record<string, string>> = {
  none: {},
  sandbox: { Authorization: "Bearer sbx" },
  owner: { Authorization: "Bearer tok:alice" },
  other: { Authorization: "Bearer tok:bob" },
};

/** Substitute the live ids and the fixed stand-ins into a probe pattern. */
function render(path: string, ids: Record<string, string>): string {
  return path
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? (ids[segment.slice(1)] ?? PARAM_VALUES[segment.slice(1)] ?? "x")
        : segment,
    )
    .join("/");
}

/** Stand-ins for the pattern segments the store does not mint. */
const PARAM_VALUES: Record<string, string> = {
  conversationId: "c1",
  turnId: "t1",
  slug: "sample",
  key: "theme",
  provider: "openai-codex",
  connectionId: "conn1",
  routineId: "r1",
  runId: "run1",
  requestId: "req1",
  activityId: "act1",
  relPath: "notes/today.md",
};

function readBody(
  text: string,
  contentType: string | null,
): { bodyKeys: string[] | null; errorCode: string | null } {
  if (!contentType?.includes("json")) return EMPTY_BODY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY_BODY;
  }
  if (Array.isArray(parsed)) return { bodyKeys: ["<array>"], errorCode: null };
  if (!parsed || typeof parsed !== "object") return EMPTY_BODY;
  const body: Record<string, unknown> = { ...parsed };
  return {
    bodyKeys: Object.keys(body).sort(),
    errorCode: typeof body.error === "string" ? body.error : null,
  };
}

async function record(
  base: string,
  probe: ProbeCase,
  host: ReplayHost,
): Promise<ProbeRecord> {
  const hasBody = probe.method !== "GET" && probe.method !== "HEAD";
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const response = await fetch(`${base}${render(probe.path, host.ids)}`, {
      method: probe.method,
      headers: {
        ...AUTH_HEADERS[probe.auth],
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      ...(hasBody ? { body: "{}" } : {}),
      signal: abort.signal,
    });
    const contentType = response.headers.get("content-type");
    // A stream never ends on its own: its headers ARE the whole answer here,
    // so the body is left unread and the request cut.
    const streaming = contentType?.includes("event-stream") === true;
    if (streaming) abort.abort();
    const body = streaming
      ? EMPTY_BODY
      : readBody(await response.text(), contentType);
    return {
      status: response.status,
      contentType,
      errorCode: body.errorCode,
      bodyKeys: body.bodyKeys,
      forwarded: host.forwarded[0] ?? null,
    };
  } catch {
    return {
      status: "timeout",
      contentType: null,
      errorCode: null,
      bodyKeys: null,
      forwarded: host.forwarded[0] ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Replay every probe against a FRESH host. One server per probe is what makes
 * the baseline order-free: a `DELETE /agents/:agentId` probe cannot change the
 * answer a later probe records, so a diff is always a routing change and never
 * a replay artefact.
 */
export async function replayRoutes(): Promise<Record<string, ProbeRecord>> {
  const records: Record<string, ProbeRecord> = {};
  const unfence = fenceOutboundFetch();
  try {
    for (const probe of probeCases()) {
      const host = await replayHost();
      const server = createControlPlaneServer(host.deps);
      const base = await listen(server);
      try {
        records[probe.key] = await record(base, probe, host);
      } finally {
        await close(server);
      }
    }
  } finally {
    unfence();
  }
  return records;
}
