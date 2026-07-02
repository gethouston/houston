/**
 * The Composio HTTP transport: one authenticated call against the v3 REST API
 * with the platform `x-api-key`. Kept apart from the adapter so composio.ts is
 * pure request-shaping + port mapping.
 */

export interface CallOpts {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Treat these statuses as "no" rather than an error (e.g. 404 → null). */
  nullStatuses?: number[];
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

    const res = await this.fetchImpl(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (opts.nullStatuses?.includes(res.status)) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `composio ${opts.method ?? "GET"} ${path} → ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      );
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }
}
