import { EngineConversationsClient } from "./client-conversations";
import { EngineError } from "./requester";
import { readEventStream } from "./sse-read";

export interface BrowserLiveStreamOptions {
  signal: AbortSignal;
  onFrame: (raw: unknown) => void;
  onActivity?: () => void;
}

export abstract class EngineBrowserClient extends EngineConversationsClient {
  protected abstract request(
    path: string,
    init?: RequestInit,
  ): Promise<Response>;

  async streamBrowserLive(
    id: string,
    viewer: string,
    layout: "desktop" | "phone",
    handoff: string | undefined,
    opts: BrowserLiveStreamOptions,
  ): Promise<void> {
    const query = new URLSearchParams();
    query.set("viewer", viewer);
    query.set("layout", layout);
    if (handoff !== undefined) query.set("handoff", handoff);
    const suffix = query.toString();
    const res = await this.request(
      `/conversations/${encodeURIComponent(id)}/browser/live${suffix ? `?${suffix}` : ""}`,
      { method: "GET", signal: opts.signal },
    );
    if (!res.body)
      throw new EngineError(0, "no response body for browser live stream");
    await readEventStream(res.body, opts.onFrame, opts.onActivity);
  }

  browserInput(id: string, body: unknown) {
    return this.json<unknown>(
      `/conversations/${encodeURIComponent(id)}/browser/input`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }
}
