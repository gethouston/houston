import { vi } from "vitest";

/**
 * The wire behind the adapter's agent list, for tests whose subject is
 * something the list merely feeds (provider routing, the selection pref).
 *
 * The list is an SDK read — `GET /agents` over the shared gateway fetch, with
 * web's colour reconcile alongside it — so a test that needs a KNOWN list, or a
 * failing one, stubs the wire rather than a control-plane export.
 */

/** One agent exactly as the host's `GET /agents` serves it. */
export const wireAgent = (id: string, workspaceId = "ws") => ({
  id,
  name: id,
  workspaceId,
  createdAt: 0,
});

/** One answer to `GET /agents`: the agents served, or a failure to serve them. */
export type AgentListAnswer = object[] | { status: number; error: string };

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let originalFetch: typeof fetch | null = null;

/**
 * Answer each `GET /agents` with the next of `answers`, the last one repeating
 * once they run out; every other request (the colour preference, a delegated
 * write) gets an empty 200.
 */
export function stubAgentListFetch(...answers: AgentListAnswer[]): void {
  originalFetch ??= globalThis.fetch;
  const queue = [...answers];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    if (!String(input).endsWith("/agents")) return json(200, {});
    const answer = (queue.length > 1 ? queue.shift() : queue[0]) ?? [];
    return Array.isArray(answer)
      ? json(200, answer)
      : json(answer.status, { error: answer.error });
  }) as unknown as typeof fetch;
}

/** Put the real `fetch` back. */
export function restoreAgentListFetch(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = null;
}
