import { readFile, writeFile } from "node:fs/promises";
import type { Toolkit } from "../types";
import HUB_CATALOG_SNAPSHOT from "./hub-catalog.json";

/**
 * Where a fresh hub catalog comes from: the repo's own snapshot, republished
 * on every merge and refreshed weekly by CI — public toolkit metadata, no
 * auth. A self-hoster can point HOUSTON_HUB_CATALOG_URL anywhere (or set it
 * empty to stay fully offline on the baked snapshot).
 */
export const DEFAULT_HUB_CATALOG_URL =
  "https://raw.githubusercontent.com/gethouston/houston/main/packages/host/src/integrations/mcp/hub-catalog.json";

const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheFile {
  fetchedAtMs: number;
  toolkits: Toolkit[];
}

/** Structurally valid catalog: an array of {slug, name} objects. */
function validCatalog(value: unknown): value is Toolkit[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (t) =>
        !!t &&
        typeof t === "object" &&
        typeof (t as Toolkit).slug === "string" &&
        typeof (t as Toolkit).name === "string",
    )
  );
}

/**
 * The hub's browsable catalog, kept fresh WITHOUT gating anything on the
 * network: `resolve()` answers instantly from the newest local layer (disk
 * cache, else the baked snapshot) and refreshes the disk cache in the
 * background once the TTL lapses. Freshness is cosmetic — connect / search /
 * execute never consult the catalog — so a fetch failure only means the
 * browse grid ages until the next attempt, and it is logged, never thrown.
 */
export class HubCatalogSource {
  private cache?: CacheFile;
  private loaded = false;
  private refreshing?: Promise<void>;

  constructor(
    private readonly options: {
      /** Disk cache location (e.g. <credentials-dir>/mcp-hub-catalog.json). */
      cachePath: string;
      /** undefined → DEFAULT_HUB_CATALOG_URL; "" → never fetch (offline). */
      url?: string;
      fetchFn?: typeof fetch;
      nowMs?: () => number;
    },
  ) {}

  private url(): string {
    return this.options.url ?? DEFAULT_HUB_CATALOG_URL;
  }

  private now(): number {
    return this.options.nowMs?.() ?? Date.now();
  }

  async resolve(): Promise<Toolkit[]> {
    if (!this.loaded) {
      this.loaded = true;
      try {
        const parsed: unknown = JSON.parse(
          await readFile(this.options.cachePath, "utf8"),
        );
        const c = parsed as CacheFile;
        if (typeof c?.fetchedAtMs === "number" && validCatalog(c.toolkits)) {
          this.cache = c;
        }
      } catch {
        // Missing or corrupt cache: the baked snapshot serves until a
        // refresh lands. Never fatal.
      }
    }
    const stale = !this.cache || this.now() - this.cache.fetchedAtMs >= TTL_MS;
    if (stale && this.url() && !this.refreshing) {
      // Background refresh: the caller gets the current layer NOW; the next
      // resolve() after the fetch lands sees the fresh list.
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.cache?.toolkits ?? (HUB_CATALOG_SNAPSHOT as Toolkit[]);
  }

  /** One fetch → validate → persist. Public so tests can await it directly. */
  async refresh(): Promise<void> {
    try {
      const fetchFn = this.options.fetchFn ?? fetch;
      const res = await fetchFn(this.url(), {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
      const body: unknown = await res.json();
      if (!validCatalog(body)) throw new Error("catalog shape mismatch");
      const next: CacheFile = { fetchedAtMs: this.now(), toolkits: body };
      this.cache = next;
      await writeFile(this.options.cachePath, JSON.stringify(next));
    } catch (error) {
      console.error(
        "[integrations] hub catalog refresh failed (keeping the current list):",
        error,
      );
    }
  }
}
