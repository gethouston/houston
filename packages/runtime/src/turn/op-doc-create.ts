import {
  acceptPut,
  type publish,
  putAtRevision,
  request,
} from "./turn-activity-doc";

export async function publishIfAbsent(
  opts: Parameters<typeof publish>[0],
  doc: unknown,
): ReturnType<typeof publish> {
  const current = await request(opts);
  await current.body?.cancel();
  if (current.status !== 404) return { skipped: "stale_after_conflict" };
  const response = await putAtRevision(opts, doc, 0);
  if (response.status === 409) {
    await response.body?.cancel();
    return { skipped: "stale_after_conflict" };
  }
  return acceptPut(response);
}
