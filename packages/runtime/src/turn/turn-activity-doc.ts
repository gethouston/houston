import { fetchWithRetry } from "@houston/runtime-client/object-sync";

const REQUEST_TIMEOUT_MS = 5_000;

export type ActivityDocPublishResult =
  | { ok: true }
  | { disabled: true; reason: "route_absent" }
  | { skipped: "stale_after_conflict" }
  | { error: string };

export interface ActivityDocOptions {
  family: string;
  baseUrl: string;
  org: string;
  agent: string;
  conversationId: string;
  hostToken: string;
  claim: { token: string; bootId: string };
  fetchImpl: typeof fetch;
  retryDelaysMs?: number[];
}

export const statusError = (method: string, response: Response) =>
  ({
    error: `${method} rejected (${response.status})`,
  }) as const;

export async function request(
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

export async function putAtRevision(
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

export async function acceptPut(
  response: Response,
): Promise<ActivityDocPublishResult> {
  if (response.status === 404 || response.status === 403) {
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

export async function publish(
  opts: ActivityDocOptions,
  doc: unknown,
  reload?: () => Promise<unknown>,
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
  const latest = reload ? await reload() : doc;
  if (latest === undefined) return { skipped: "stale_after_conflict" };
  return acceptPut(await putAtRevision(opts, latest, current));
}

export const activityDocStale = (result: ActivityDocPublishResult | null) =>
  result !== null &&
  ("error" in result || "skipped" in result || "disabled" in result);
