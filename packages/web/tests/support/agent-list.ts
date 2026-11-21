import { vi } from "vitest";

export const wireAgent = (id: string, workspaceId = "ws") => ({
  id,
  name: id,
  workspaceId,
  createdAt: 0,
});

export type AgentListAnswer = object[] | { status: number; error: string };

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let originalFetch: typeof fetch | null = null;

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

export function restoreAgentListFetch(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = null;
}
