export interface CallOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  nullStatuses?: number[];
}

export class ComposioApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ComposioApiError";
  }
}

const DROPPED_CODES = new Set(["ECONNRESET", "UND_ERR_SOCKET"]);

function droppedConnection(err: unknown): boolean {
  const codeOf = (e: unknown) =>
    typeof e === "object" && e !== null
      ? (e as { code?: unknown }).code
      : undefined;
  const cause =
    typeof err === "object" && err !== null
      ? (err as { cause?: unknown }).cause
      : undefined;
  return [codeOf(err), codeOf(cause)].some(
    (code) => typeof code === "string" && DROPPED_CODES.has(code),
  );
}

export class ComposioHttp {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async call<T>(path: string, opts: CallOpts = {}): Promise<T | null> {
    const url = new URL(`${this.baseURL}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = { "x-api-key": this.apiKey };
    if (opts.body !== undefined) headers["content-type"] = "application/json";

    const method = opts.method ?? "GET";
    const send = () =>
      this.fetchImpl(url.toString(), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    const res = await send().catch((err: unknown) => {
      if (method === "GET" && droppedConnection(err)) return send();
      throw err;
    });

    if (opts.nullStatuses?.includes(res.status)) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ComposioApiError(
        res.status,
        `composio ${method} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }
}
