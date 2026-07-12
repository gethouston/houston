/**
 * Fallback shims for the globals the bundled SDK + runtime-client touch that a
 * bare embedded JS engine (JavaScriptCore / Hermes, outside a WebKit web
 * context) does not guarantee. Each is installed ONLY when absent, so a host
 * that already provides a richer implementation wins.
 *
 * Covered here (self-provided by the bundle):
 *  - `Headers` + `Request`  — `auth-fetch.ts` builds `new Headers()` on every
 *    authenticated request and tests `input instanceof Request`.
 *  - `AbortController` / `AbortSignal` — the resume/turn/observe/global-events
 *    loops abort streams with these.
 *  - `TextEncoder` / `TextDecoder` — SSE parsing decodes UTF-8 stream chunks.
 *  - `URLSearchParams`: `runtime-client`'s `startLogin` builds the
 *    `providers/login` query string with it (see `url-search-params.ts`).
 *
 * NOT shimmed (must come from the host — see BRIDGE.md "Host polyfills"):
 *  - `setTimeout` / `clearTimeout` / `setInterval` / `clearInterval` — timers
 *    need the native run loop; there is no pure-JS substitute.
 *  - `crypto.getRandomValues` (optional; nonce falls back to `Math.random`) and
 *    `console` (optional diagnostics).
 */

import { URLSearchParamsShim } from "./url-search-params";

interface GlobalWithShims {
  [key: string]: unknown;
}

class HeadersShim {
  private readonly map = new Map<string, string>();
  constructor(init?: unknown) {
    if (!init) return;
    if (Array.isArray(init)) {
      for (const [k, v] of init as [string, string][]) this.set(k, v);
    } else if (typeof (init as HeadersShim).forEach === "function") {
      (init as HeadersShim).forEach((v, k) => {
        this.set(k, v);
      });
    } else {
      const rec = init as Record<string, unknown>;
      for (const k of Object.keys(rec)) this.set(k, String(rec[k]));
    }
  }
  set(key: string, value: string): void {
    this.map.set(String(key).toLowerCase(), String(value));
  }
  append(key: string, value: string): void {
    const cur = this.get(key);
    this.set(key, cur !== null ? `${cur}, ${value}` : value);
  }
  get(key: string): string | null {
    return this.map.get(String(key).toLowerCase()) ?? null;
  }
  has(key: string): boolean {
    return this.map.has(String(key).toLowerCase());
  }
  delete(key: string): void {
    this.map.delete(String(key).toLowerCase());
  }
  forEach(cb: (value: string, key: string, parent: HeadersShim) => void): void {
    for (const [k, v] of this.map) cb(v, k, this);
  }
}

class AbortSignalShim {
  aborted = false;
  reason: unknown;
  onabort: ((ev: { type: "abort" }) => void) | null = null;
  private readonly listeners = new Set<(ev: { type: "abort" }) => void>();
  addEventListener(type: string, cb: (ev: { type: "abort" }) => void): void {
    if (type === "abort") this.listeners.add(cb);
  }
  removeEventListener(type: string, cb: (ev: { type: "abort" }) => void): void {
    if (type === "abort") this.listeners.delete(cb);
  }
  dispatchEvent(): boolean {
    return true;
  }
  fire(reason: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const ev = { type: "abort" as const };
    this.onabort?.(ev);
    for (const cb of [...this.listeners]) cb(ev);
    this.listeners.clear();
  }
}

class AbortControllerShim {
  readonly signal = new AbortSignalShim();
  abort(reason?: unknown): void {
    this.signal.fire(reason ?? new Error("aborted"));
  }
}

/** Streaming UTF-8 decoder: buffers a trailing incomplete sequence. */
class TextDecoderShim {
  private leftover = new Uint8Array(0);
  decode(input?: Uint8Array, options?: { stream?: boolean }): string {
    const bytes = input ?? new Uint8Array(0);
    const buf = new Uint8Array(this.leftover.length + bytes.length);
    buf.set(this.leftover, 0);
    buf.set(bytes, this.leftover.length);
    let out = "";
    let i = 0;
    while (i < buf.length) {
      const b0 = buf[i];
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
        i++;
        continue;
      }
      let need: number;
      let cp: number;
      if (b0 >= 0xc0 && b0 < 0xe0) [need, cp] = [1, b0 & 0x1f];
      else if (b0 >= 0xe0 && b0 < 0xf0) [need, cp] = [2, b0 & 0x0f];
      else if (b0 >= 0xf0 && b0 < 0xf8) [need, cp] = [3, b0 & 0x07];
      else {
        out += "�";
        i++;
        continue;
      }
      if (i + need + 1 > buf.length) break; // incomplete: stash and wait
      let ok = true;
      for (let k = 1; k <= need; k++) {
        const bk = buf[i + k];
        if ((bk & 0xc0) !== 0x80) {
          ok = false;
          break;
        }
        cp = (cp << 6) | (bk & 0x3f);
      }
      if (!ok) {
        out += "�";
        i++;
        continue;
      }
      i += need + 1;
      if (cp > 0xffff) {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else out += String.fromCharCode(cp);
    }
    const rest = buf.subarray(i);
    if (options?.stream) {
      this.leftover = rest;
      return out;
    }
    this.leftover = new Uint8Array(0);
    return rest.length > 0 ? `${out}�` : out;
  }
}

class TextEncoderShim {
  encode(input = ""): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      let cp = input.charCodeAt(i);
      if (cp >= 0xd800 && cp < 0xdc00 && i + 1 < input.length) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (input.charCodeAt(++i) - 0xdc00);
      }
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      else if (cp < 0x10000)
        out.push(
          0xe0 | (cp >> 12),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f),
        );
      else
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f),
        );
    }
    return new Uint8Array(out);
  }
}

/** Install each shim into `globalThis` only where the global is missing. */
export function installGlobalShims(): void {
  const g = globalThis as unknown as GlobalWithShims;
  if (typeof g.Headers === "undefined") g.Headers = HeadersShim;
  if (typeof g.Request === "undefined") g.Request = class RequestShim {};
  if (typeof g.AbortController === "undefined")
    g.AbortController = AbortControllerShim;
  if (typeof g.AbortSignal === "undefined") g.AbortSignal = AbortSignalShim;
  if (typeof g.TextDecoder === "undefined") g.TextDecoder = TextDecoderShim;
  if (typeof g.TextEncoder === "undefined") g.TextEncoder = TextEncoderShim;
  if (typeof g.URLSearchParams === "undefined")
    g.URLSearchParams = URLSearchParamsShim;
}
