import {
  type ConflictBackoff,
  jitteredConflictBackoff,
} from "@houston/runtime-client/object-sync";
import {
  type ActivityDocOptions,
  type ActivityDocPublishResult,
  acceptPut,
  putAtRevision,
  request,
  statusError,
} from "./turn-activity-doc";

export const DOC_MERGE_ROUNDS = 10;

interface CurrentDoc {
  revision: number;
  doc?: unknown;
}

async function readAnswer(
  response: Response,
): Promise<{ revision?: number; doc?: unknown; carriesDoc: boolean }> {
  const etag = response.headers
    .get("ETag")
    ?.replace(/^W\//, "")
    .replaceAll('"', "");
  const tagged =
    etag && Number.isSafeInteger(Number(etag)) ? Number(etag) : undefined;
  let body: { revision?: unknown; doc?: unknown } = {};
  try {
    const parsed = JSON.parse(await response.text()) as unknown;
    if (typeof parsed === "object" && parsed !== null)
      body = parsed as typeof body;
  } catch {}
  const revision =
    tagged ??
    (typeof body.revision === "number" && Number.isSafeInteger(body.revision)
      ? body.revision
      : undefined);
  return { revision, doc: body.doc, carriesDoc: "doc" in body };
}

async function readCurrent(
  opts: ActivityDocOptions,
): Promise<CurrentDoc | { error: string }> {
  const response = await request(opts);
  if (response.status === 404) {
    await response.body?.cancel();
    return { revision: 0 };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return statusError("GET", response);
  }
  const answer = await readAnswer(response);
  if (!answer.carriesDoc) return { error: "GET answered without a doc" };
  return { revision: answer.revision ?? 0, doc: answer.doc };
}

export async function publishMerged(
  opts: ActivityDocOptions,
  merge: (current: unknown) => unknown,
  backoff: ConflictBackoff = jitteredConflictBackoff,
): Promise<ActivityDocPublishResult> {
  let current = await readCurrent(opts);
  for (let round = 1; ; round += 1) {
    if ("error" in current) return current;
    if (round > 1) await sleep(backoff(round - 1));
    const response = await putAtRevision(
      opts,
      merge(current.doc),
      current.revision,
    );
    if (response.status !== 409 || round === DOC_MERGE_ROUNDS) {
      return acceptPut(response);
    }
    const conflict = await readAnswer(response);
    current =
      conflict.revision !== undefined && conflict.carriesDoc
        ? { revision: conflict.revision, doc: conflict.doc }
        : await readCurrent(opts);
  }
}

export async function publishDerived(
  opts: ActivityDocOptions,
  derive: (current: unknown) => Promise<unknown>,
  backoff: ConflictBackoff = jitteredConflictBackoff,
): Promise<ActivityDocPublishResult> {
  let current = await readCurrent(opts);
  for (let round = 1; ; round += 1) {
    if ("error" in current) return current;
    if (round > 1) await sleep(backoff(round - 1));
    const response = await putAtRevision(
      opts,
      await derive(current.doc),
      current.revision,
    );
    if (response.status !== 409 || round === DOC_MERGE_ROUNDS) {
      return acceptPut(response);
    }
    const conflict = await readAnswer(response);
    current =
      conflict.revision !== undefined && conflict.carriesDoc
        ? { revision: conflict.revision, doc: conflict.doc }
        : await readCurrent(opts);
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
