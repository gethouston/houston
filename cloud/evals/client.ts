/**
 * Minimal control-plane driver for the evals harness. Speaks the same wire
 * surface the web build uses: create agent → subscribe SSE → post message →
 * wait for the terminal frame → list/download workspace files → delete agent.
 *
 * Auth: any bearer the control plane accepts — a Supabase access token, a
 * `dev:<userId>` token (CP_DEV=1), or a CP_SERVICE_TOKENS entry (the nightly
 * path).
 */
export interface CpClient {
  baseUrl: string;
  token: string;
}

interface WireEvent {
  type: string;
  data: unknown;
}

async function api(
  cp: CpClient,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${cp.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cp.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${res.status}${body ? ` ${body.slice(0, 300)}` : ""}`,
    );
  }
  return res;
}

export async function createAgent(
  cp: CpClient,
  name: string,
): Promise<{ id: string }> {
  return (await (
    await api(cp, "/agents", { method: "POST", body: JSON.stringify({ name }) })
  ).json()) as {
    id: string;
  };
}

export async function deleteAgent(
  cp: CpClient,
  agentId: string,
): Promise<void> {
  await api(cp, `/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}

/**
 * Run one turn and wait for its terminal frame. Subscribe-then-send: the SSE
 * stream is open before the message posts, so no frame can be missed. Resolves
 * with the turn outcome; rejects only on transport/timeout failures.
 */
export async function runTurn(
  cp: CpClient,
  agentId: string,
  conversationId: string,
  text: string,
  timeoutSec: number,
): Promise<{
  outcome: "done" | "error";
  errorMessage?: string;
  events: number;
}> {
  const ctrl = new AbortController();
  const events = await fetch(
    `${cp.baseUrl}/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(
      conversationId,
    )}/events`,
    { headers: { Authorization: `Bearer ${cp.token}` }, signal: ctrl.signal },
  );
  if (!events.ok || !events.body) {
    ctrl.abort();
    throw new Error(`events stream failed: ${events.status}`);
  }

  let settle: (v: {
    outcome: "done" | "error";
    errorMessage?: string;
    events: number;
  }) => void;
  let fail: (e: Error) => void;
  const result = new Promise<{
    outcome: "done" | "error";
    errorMessage?: string;
    events: number;
  }>((res, rej) => {
    settle = res;
    fail = rej;
  });
  let count = 0;

  const timer = setTimeout(() => {
    ctrl.abort();
    fail(
      new Error(`turn timed out after ${timeoutSec}s (${count} events seen)`),
    );
  }, timeoutSec * 1000);

  void (async () => {
    // events.body is guaranteed non-null: the `!events.body` guard above throws before here.
    const body = events.body as ReadableStream<Uint8Array>;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep = buf.indexOf("\n\n");
        while (sep >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const e = JSON.parse(line.slice(6)) as WireEvent;
            count++;
            if (e.type === "done") {
              clearTimeout(timer);
              ctrl.abort();
              settle({ outcome: "done", events: count });
              return;
            }
            if (e.type === "error") {
              clearTimeout(timer);
              ctrl.abort();
              const message = (e.data as { message?: string } | null)?.message;
              settle({
                outcome: "error",
                errorMessage: message,
                events: count,
              });
              return;
            }
          }
          sep = buf.indexOf("\n\n");
        }
      }
      clearTimeout(timer);
      fail(
        new Error(
          `event stream closed without a terminal frame (${count} events)`,
        ),
      );
    } catch (err) {
      clearTimeout(timer);
      if (!ctrl.signal.aborted)
        fail(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  // Stream is open — now send the message (202 expected).
  await api(
    cp,
    `/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ text, nonce: `eval-${conversationId}` }),
    },
  );

  return result;
}

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  is_directory: boolean;
}

export async function listFiles(
  cp: CpClient,
  agentId: string,
): Promise<ProjectFile[]> {
  return (await (
    await api(cp, `/agents/${encodeURIComponent(agentId)}/files`)
  ).json()) as ProjectFile[];
}

export async function downloadFile(
  cp: CpClient,
  agentId: string,
  relPath: string,
): Promise<Uint8Array> {
  const res = await api(
    cp,
    `/agents/${encodeURIComponent(agentId)}/files/download?path=${encodeURIComponent(relPath)}`,
  );
  return new Uint8Array(await res.arrayBuffer());
}
