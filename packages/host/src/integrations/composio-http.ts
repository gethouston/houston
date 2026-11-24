/**
 * The Composio HTTP transport: one authenticated call against the v3 REST API
 * with the platform `x-api-key`. Kept apart from the adapter so composio.ts is
 * pure request-shaping + port mapping.
 */

export interface CallOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Treat these statuses as "no" rather than an error (e.g. 404 → null). */
  nullStatuses?: number[];
}

/**
 * A non-2xx Composio reply. Carries the upstream status so callers can react
 * to a specific rejection (auth-config fallback keys off a 400) without
 * parsing the message; the message keeps the established
 * `composio <METHOD> <path> → <status>: <detail>` shape end to end.
 */
export class ComposioApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ComposioApiError";
  }
}

/** Codes a connection that died mid-request carries: undici wraps them in the
 *  `fetch failed` TypeError's `cause`, Bun sets them on the error itself. DNS
 *  failures and refused connections are not here; resending those only
 *  doubles the wait. */
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

  /**
   * One HTTP call. Non-2xx surfaces as a thrown error (beta policy: no silent
   * failures) UNLESS the status is in `nullStatuses` (→ returns null).
   */
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
    // Composio drops an idle connection now and then; a read is safe to send
    // once more, a write is not (the first attempt may have landed).
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
