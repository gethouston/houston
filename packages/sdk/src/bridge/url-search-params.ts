/**
 * `URLSearchParams` fallback for a bare embedded JS engine (JavaScriptCore /
 * Hermes outside a WebKit web context) that does not provide it. Kept in its
 * own module so `shims.ts` stays within the 200-line limit; installed only when
 * absent by `installGlobalShims`.
 *
 * `runtime-client`'s `startLogin` builds `new URLSearchParams()` + `set` +
 * `toString` to assemble the `providers/login` query string; without this shim
 * that path throws a ReferenceError on iOS and blocks provider connect. The
 * full spec surface is implemented so any other consumer keeps working too.
 */

/** application/x-www-form-urlencoded: encodeURIComponent, space -> "+". */
function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/** Inverse of {@link encode}: "+" -> space, then percent-decode. */
function decode(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

type Pair = [string, string];

export class URLSearchParamsShim {
  private readonly pairs: Pair[] = [];

  constructor(init?: unknown) {
    if (init === undefined || init === null || init === "") return;
    if (typeof init === "string") {
      const query = init.charAt(0) === "?" ? init.slice(1) : init;
      for (const part of query.split("&")) {
        if (part === "") continue;
        const eq = part.indexOf("=");
        if (eq === -1) this.pairs.push([decode(part), ""]);
        else
          this.pairs.push([
            decode(part.slice(0, eq)),
            decode(part.slice(eq + 1)),
          ]);
      }
      return;
    }
    const iterable = init as { [Symbol.iterator]?: unknown };
    if (typeof iterable[Symbol.iterator] === "function") {
      for (const entry of init as Iterable<[unknown, unknown]>) {
        this.pairs.push([String(entry[0]), String(entry[1])]);
      }
      return;
    }
    const rec = init as Record<string, unknown>;
    for (const k of Object.keys(rec)) this.pairs.push([k, String(rec[k])]);
  }

  get size(): number {
    return this.pairs.length;
  }

  append(name: string, value: string): void {
    this.pairs.push([String(name), String(value)]);
  }

  set(name: string, value: string): void {
    const key = String(name);
    const val = String(value);
    const kept: Pair[] = [];
    let replaced = false;
    for (const pair of this.pairs) {
      if (pair[0] !== key) kept.push(pair);
      else if (!replaced) {
        kept.push([key, val]);
        replaced = true;
      }
    }
    if (!replaced) kept.push([key, val]);
    this.pairs.length = 0;
    this.pairs.push(...kept);
  }

  get(name: string): string | null {
    const key = String(name);
    for (const [k, v] of this.pairs) if (k === key) return v;
    return null;
  }

  getAll(name: string): string[] {
    const key = String(name);
    return this.pairs.filter(([k]) => k === key).map(([, v]) => v);
  }

  has(name: string): boolean {
    const key = String(name);
    return this.pairs.some(([k]) => k === key);
  }

  delete(name: string): void {
    const key = String(name);
    for (let i = this.pairs.length - 1; i >= 0; i--) {
      if (this.pairs[i][0] === key) this.pairs.splice(i, 1);
    }
  }

  forEach(
    cb: (value: string, key: string, parent: URLSearchParamsShim) => void,
  ): void {
    for (const [k, v] of [...this.pairs]) cb(v, k, this);
  }

  *entries(): IterableIterator<Pair> {
    for (const [k, v] of this.pairs) yield [k, v];
  }

  *keys(): IterableIterator<string> {
    for (const [k] of this.pairs) yield k;
  }

  *values(): IterableIterator<string> {
    for (const [, v] of this.pairs) yield v;
  }

  [Symbol.iterator](): IterableIterator<Pair> {
    return this.entries();
  }

  /** Stable sort by name (UTF-16 code units), preserving equal-key order. */
  sort(): void {
    const indexed = this.pairs.map((p, i) => [p, i] as const);
    indexed.sort((a, b) => {
      if (a[0][0] < b[0][0]) return -1;
      if (a[0][0] > b[0][0]) return 1;
      return a[1] - b[1];
    });
    this.pairs.length = 0;
    for (const [p] of indexed) this.pairs.push(p);
  }

  toString(): string {
    return this.pairs.map(([k, v]) => `${encode(k)}=${encode(v)}`).join("&");
  }
}
