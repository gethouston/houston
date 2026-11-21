export type CustodyCreate = "created" | "exists" | "unsupported";

export interface LegacyCustodyResult {
  moved: number;
  complete: boolean;
}

export async function moveLegacyToCustody(
  entries: Record<string, string>,
  custody: {
    get: (id: string) => Promise<string | null>;
    create: (id: string, value: string) => Promise<CustodyCreate>;
  },
): Promise<LegacyCustodyResult> {
  let moved = 0;
  let complete = true;
  for (const [id, value] of Object.entries(entries)) {
    if ((await custody.get(id)) !== null) continue;
    const created = await custody.create(id, value);
    if (created === "created") moved++;
    else if (created === "unsupported" || (await custody.get(id)) === null)
      complete = false;
  }
  return { moved, complete };
}

export async function createCustomSecret(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  id: string,
  value: string,
): Promise<CustodyCreate> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
  await response.body?.cancel();
  if (response.status === 412) return "exists";
  if (response.status === 405) return "unsupported";
  if (!response.ok)
    throw new Error(`custom secret create ${id} failed (${response.status})`);
  return "created";
}
