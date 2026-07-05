/**
 * A scripted NATIVE host that drives the bridge dispatcher in-process, exactly
 * as an iOS/Android shell would over the string pipe.
 *
 * It owns the `send` collector and plays the native side of every port: on a
 * `fetch/start` it performs a REAL `fetch` (against the in-memory fake host over
 * local HTTP) and streams the body back as base64 `fetch/chunk`s; on
 * `storage/*` it serves an in-memory map. Port reactions are deferred to a fresh
 * stack (BRIDGE.md §8: `send` marshals and returns; inbound work never re-enters
 * `send`). Helpers mint command ids and await the correlated reply frames.
 */

import { bytesToBase64 } from "../src/bridge/base64";
import { type Bridge, createBridge } from "../src/bridge/dispatcher";
import type { BridgeOutbound, NativePorts } from "../src/bridge/wire";
import type { CommandResult } from "../src/commands";
import { HoustonSdk } from "../src/sdk";

type Frame = Extract<BridgeOutbound, { kind: string }>;
type Waiter = (msg: Frame) => void;

export class ScriptedHost {
  /** Every outbound frame the SDK sent, in order. */
  readonly outbound: Frame[] = [];
  /** The host-backed key/value store (what `storage/*` serves). */
  readonly storage = new Map<string, string>();
  readonly bridge: Bridge;
  /** Count of `fetch/chunk` frames the host has streamed back (byte path proof). */
  chunkCount = 0;
  private readonly waiters = new Set<Waiter>();
  private readonly fetches = new Map<string, AbortController>();
  private cmdSeq = 0;

  constructor() {
    this.bridge = createBridge(
      (config) => new HoustonSdk(config),
      (message) => this.onSend(message),
    );
  }

  private onSend(message: string): void {
    const msg = JSON.parse(message) as Frame;
    this.outbound.push(msg);
    for (const w of [...this.waiters]) w(msg);
    // React to native-port requests on a fresh stack (never re-enter receive).
    if (msg.kind === "fetch/start") queueMicrotask(() => this.doFetch(msg));
    else if (msg.kind === "fetch/abort") this.fetches.get(msg.id)?.abort();
    else if (msg.kind === "storage/get")
      queueMicrotask(() =>
        this.deliver({
          kind: "storage/result",
          id: msg.id,
          value: this.storage.get(msg.key) ?? null,
        }),
      );
    else if (msg.kind === "storage/set")
      queueMicrotask(() => {
        this.storage.set(msg.key, msg.value);
        this.deliver({ kind: "storage/result", id: msg.id });
      });
    else if (msg.kind === "storage/delete")
      queueMicrotask(() => {
        this.storage.delete(msg.key);
        this.deliver({ kind: "storage/result", id: msg.id });
      });
  }

  private async doFetch(
    msg: Extract<Frame, { kind: "fetch/start" }>,
  ): Promise<void> {
    const ac = new AbortController();
    this.fetches.set(msg.id, ac);
    let res: Response;
    try {
      res = await fetch(msg.url, {
        method: msg.method,
        headers: msg.headers,
        body: msg.body,
        signal: ac.signal,
      });
    } catch (err) {
      this.fetches.delete(msg.id);
      this.deliver({ kind: "fetch/error", id: msg.id, message: String(err) });
      return;
    }
    this.deliver({
      kind: "fetch/response",
      id: msg.id,
      status: res.status,
      ok: res.ok,
    });
    const reader = res.body?.getReader();
    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          this.chunkCount++;
          this.deliver({
            kind: "fetch/chunk",
            id: msg.id,
            bytesBase64: bytesToBase64(value),
          });
        }
      }
      this.deliver({ kind: "fetch/done", id: msg.id });
    } catch (err) {
      this.deliver({ kind: "fetch/error", id: msg.id, message: String(err) });
    } finally {
      this.fetches.delete(msg.id);
    }
  }

  /** Deliver one inbound frame to the bridge (host -> SDK). */
  deliver(msg: unknown): void {
    this.bridge.receive(JSON.stringify(msg));
  }

  /** Deliver a raw (possibly malformed) inbound string. */
  deliverRaw(raw: string): void {
    this.bridge.receive(raw);
  }

  private waitFor(pred: (m: Frame) => boolean): Promise<Frame> {
    const seen = this.outbound.find(pred);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve) => {
      const w: Waiter = (m) => {
        if (pred(m)) {
          this.waiters.delete(w);
          resolve(m);
        }
      };
      this.waiters.add(w);
    });
  }

  async configure(baseUrl: string, native?: NativePorts): Promise<void> {
    this.deliver({ kind: "configure", baseUrl, ...(native ? { native } : {}) });
    await this.waitFor((m) => m.kind === "ready");
  }

  async command(type: string, payload?: unknown): Promise<CommandResult> {
    const id = `c${++this.cmdSeq}`;
    const done = this.waitFor((m) => m.kind === "result" && m.result.id === id);
    this.deliver({
      kind: "command",
      envelope: { id, type, ...(payload !== undefined ? { payload } : {}) },
    });
    return ((await done) as Extract<Frame, { kind: "result" }>).result;
  }

  async subscribe(
    sub: string,
    scope: string,
  ): Promise<Extract<Frame, { kind: "subscribed" }>> {
    const done = this.waitFor((m) => m.kind === "subscribed" && m.sub === sub);
    this.deliver({ kind: "subscribe", sub, scope });
    return (await done) as Extract<Frame, { kind: "subscribed" }>;
  }

  unsubscribe(sub: string): void {
    this.deliver({ kind: "unsubscribe", sub });
  }

  /** Every `snapshot` push for `sub`, in order. */
  snapshots(sub: string): Extract<Frame, { kind: "snapshot" }>[] {
    return this.outbound.filter(
      (m): m is Extract<Frame, { kind: "snapshot" }> =>
        m.kind === "snapshot" && m.sub === sub,
    );
  }

  /** Poll until `predicate` holds, then resolve. */
  async until(
    predicate: () => boolean,
    label: string,
    timeoutMs = 15000,
  ): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs)
        throw new Error(`timed out: ${label}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
}
