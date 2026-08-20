import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeActivities } from "@houston/domain";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import type { TurnServerDeps } from "./server-types";
import { type TurnFilesystem, turnActivityKey } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

const REQUEST_TIMEOUT_MS = 5_000;

/** Outcome of projecting a claimed turn's uploaded activity file. */
export type ActivityDocPublishResult =
  | { ok: true }
  | { disabled: true; reason: "route_absent" }
  | { error: string };

interface ActivityDocOptions {
  family: "activity" | "routine_runs";
  baseUrl: string;
  org: string;
  agent: string;
  conversationId: string;
  hostToken: string;
  claim: { token: string; bootId: string };
  fetchImpl: typeof fetch;
  retryDelaysMs?: number[];
}

const statusError = (method: string, response: Response) =>
  ({
    error: `${method} rejected (${response.status})`,
  }) as const;

async function request(
  opts: ActivityDocOptions,
  init?: RequestInit,
): Promise<Response> {
  const root = opts.baseUrl.replace(/\/+$/, "");
  const url = `${root}/v1/pod/docs/${encodeURIComponent(
    opts.org,
  )}/${encodeURIComponent(opts.agent)}/${opts.family}`;
  return fetchWithRetry(
    (input, requestInit) =>
      opts.fetchImpl(input, {
        ...requestInit,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    url,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${opts.hostToken}`,
        "X-Houston-Claim-Token": opts.claim.token,
        "X-Houston-Claim-Boot": opts.claim.bootId,
        "X-Houston-Claim-Conversation": opts.conversationId,
        ...init?.headers,
      },
    },
    opts.retryDelaysMs ? { delaysMs: opts.retryDelaysMs } : {},
  );
}

async function responseRevision(
  response: Response,
): Promise<number | undefined> {
  const etag = response.headers
    .get("ETag")
    ?.replace(/^W\//, "")
    .replaceAll('"', "");
  if (etag && Number.isSafeInteger(Number(etag))) {
    await response.body?.cancel();
    return Number(etag);
  }
  const text = await response.text();
  if (!text) return undefined;
  try {
    const body = JSON.parse(text) as { revision?: unknown };
    return typeof body.revision === "number" &&
      Number.isSafeInteger(body.revision)
      ? body.revision
      : undefined;
  } catch {
    return undefined;
  }
}

async function putAtRevision(
  opts: ActivityDocOptions,
  doc: unknown,
  revision: number,
): Promise<Response> {
  return request(opts, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": String(revision),
    },
    body: JSON.stringify({ doc }),
  });
}

async function acceptPut(
  response: Response,
): Promise<ActivityDocPublishResult> {
  if (response.status === 404 || response.status === 403) {
    // 404: the docs route is absent. 403: the store predates this family in
    // the claim scope. Both mean "this deployment cannot take the doc yet" —
    // a diagnostic on the terminal frame, never a failed turn.
    await response.body?.cancel();
    return { disabled: true, reason: "route_absent" };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return statusError("PUT", response);
  }
  await response.body?.cancel();
  return { ok: true };
}

async function publish(
  opts: ActivityDocOptions,
  doc: unknown,
): Promise<ActivityDocPublishResult> {
  const seeded = await request(opts);
  let revision: number;
  if (seeded.status === 404) {
    await seeded.body?.cancel();
    revision = 0;
  } else if (!seeded.ok) {
    await seeded.body?.cancel();
    return statusError("GET", seeded);
  } else {
    revision = (await responseRevision(seeded)) ?? 0;
  }

  const response = await putAtRevision(opts, doc, revision);
  if (response.status !== 409) return acceptPut(response);
  const current = await responseRevision(response);
  if (current === undefined) return statusError("PUT", response);
  return acceptPut(await putAtRevision(opts, doc, current));
}

/** Project one successfully uploaded claimed-turn activity file into the DB doc. */
export async function publishTurnActivityDoc(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  filesystem: TurnFilesystem,
): Promise<ActivityDocPublishResult | null> {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (turn.shadow || !baseUrl || !turn.claim || !turn.hostToken) return null;
  try {
    const key = turnActivityKey(filesystem.workspaceRel);
    const raw = await readFile(
      join(filesystem.workspaceDir, ".houston", "activity", "activity.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    const doc = normalizeActivities(parsed, key).items;
    const { org, agent } = poolIdentity(turn.gcsPrefix);
    return await publish(
      {
        family: "activity",
        baseUrl,
        org,
        agent,
        conversationId: turn.conversationId,
        hostToken: turn.hostToken,
        claim: { token: turn.claim.token, bootId: turn.claim.bootId },
        fetchImpl: deps.fetchImpl ?? fetch,
        ...(deps.activityDocRetryDelaysMs
          ? { retryDelaysMs: deps.activityDocRetryDelaysMs }
          : {}),
      },
      doc,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Project a routine turn's uploaded runs file into the routine_runs DB doc —
 * raw parse, mirroring the standing DocShadowProjector's non-activity
 * families byte for byte.
 */
export async function publishTurnRunsDoc(
  deps: TurnServerDeps,
  turn: TurnRequest & { turnId: string },
  filesystem: TurnFilesystem,
): Promise<ActivityDocPublishResult | null> {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (turn.shadow || !baseUrl || !turn.claim || !turn.hostToken) return null;
  try {
    const raw = await readFile(
      join(
        filesystem.workspaceDir,
        ".houston",
        "routine_runs",
        "routine_runs.json",
      ),
      "utf8",
    );
    const doc = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    const { org, agent } = poolIdentity(turn.gcsPrefix);
    return await publish(
      {
        family: "routine_runs",
        baseUrl,
        org,
        agent,
        conversationId: turn.conversationId,
        hostToken: turn.hostToken,
        claim: { token: turn.claim.token, bootId: turn.claim.bootId },
        fetchImpl: deps.fetchImpl ?? fetch,
        ...(deps.activityDocRetryDelaysMs
          ? { retryDelaysMs: deps.activityDocRetryDelaysMs }
          : {}),
      },
      doc,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
