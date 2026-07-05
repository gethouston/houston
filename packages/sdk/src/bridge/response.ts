/**
 * The MINIMAL `Response` the SDK actually consumes, assembled from the host's
 * `fetch/response` + `fetch/chunk` + `fetch/done`/`fetch/error` messages.
 *
 * This is a deliberately partial implementation — only the members the SDK's
 * fetch consumers touch are provided, each pinned to its consumer:
 *
 *  - `status`     — client.ts:93, auth-fetch.ts:106, agents/http.ts:52/56
 *  - `ok`         — client.ts:92, agents/http.ts:51
 *  - `text()`     — client.ts:93, agents/http.ts:53
 *  - `json()`     — client.ts:98, agents/http.ts:64/71/78
 *  - `body`       — client.ts:284/286 (truthiness + `getReader`)
 *  - `body.getReader().read() -> { done, value: Uint8Array }` — sse-read.ts:34/38
 *
 * `releaseLock` is provided as a no-op for spec symmetry but is NOT called by
 * any consumer (verified by grep); no consumer reads `Response.headers`, so it
 * is omitted. Bodies stream in incrementally so an SSE read starts folding
 * frames before the turn settles; `text()`/`json()` drain to `fetch/done`.
 */

/** One pull from the body reader. */
export interface ReadResult {
  done: boolean;
  value?: Uint8Array;
}

/**
 * A single-consumer pull queue of byte chunks. `push` feeds a chunk, `close`
 * ends the stream cleanly, `fail` ends it with an error (an abort or a
 * transport failure) so the pending `read` rejects — which is exactly how the
 * runtime-client's resume loop learns a connection dropped.
 */
export class ByteStream {
  private readonly chunks: Uint8Array[] = [];
  private ended = false;
  private failure: unknown;
  private resolve: ((r: ReadResult) => void) | null = null;
  private reject: ((e: unknown) => void) | null = null;

  push(bytes: Uint8Array): void {
    if (this.ended || this.failure !== undefined) return;
    if (this.resolve) {
      const r = this.take().resolve;
      r?.({ done: false, value: bytes });
    } else {
      this.chunks.push(bytes);
    }
  }

  close(): void {
    if (this.ended || this.failure !== undefined) return;
    this.ended = true;
    if (this.chunks.length === 0 && this.resolve) {
      this.take().resolve?.({ done: true, value: undefined });
    }
  }

  fail(error: unknown): void {
    if (this.ended || this.failure !== undefined) return;
    this.failure = error;
    this.take().reject?.(error);
  }

  read(): Promise<ReadResult> {
    const next = this.chunks.shift();
    if (next !== undefined)
      return Promise.resolve({ done: false, value: next });
    if (this.failure !== undefined) return Promise.reject(this.failure);
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise<ReadResult>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  /** Detach and return the current waiter callbacks (single-consumer). */
  private take(): {
    resolve: ((r: ReadResult) => void) | null;
    reject: ((e: unknown) => void) | null;
  } {
    const resolve = this.resolve;
    const reject = this.reject;
    this.resolve = null;
    this.reject = null;
    return { resolve, reject };
  }
}

/** Concatenate byte chunks into one buffer. */
function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** The partial Response backed by a {@link ByteStream}. */
export class BridgeResponse {
  readonly body = {
    getReader: () => ({
      read: (): Promise<ReadResult> => this.stream.read(),
      releaseLock: (): void => {},
    }),
  };

  constructor(
    readonly status: number,
    readonly ok: boolean,
    private readonly stream: ByteStream,
  ) {}

  async text(): Promise<string> {
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await this.stream.read();
      if (done) break;
      if (value) parts.push(value);
    }
    return new TextDecoder().decode(concat(parts));
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}
