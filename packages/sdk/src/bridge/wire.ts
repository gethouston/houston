/**
 * The bridge wire union — the JSON message vocabulary a native host exchanges
 * with the SDK dispatcher. This is the machine-readable form of the contract in
 * `packages/sdk/BRIDGE.md`; every shape here is documented there with examples.
 *
 * Two halves: {@link BridgeInbound} (host -> SDK, delivered via `receive`) and
 * {@link BridgeOutbound} (SDK -> host, delivered via `send`). Both are plain
 * JSON — nothing crosses the pipe that is not JSON-serializable.
 *
 * Versioning is additive (BRIDGE.md §4): consumers ignore unknown fields and
 * treat an unknown discriminant as inert. {@link BRIDGE_PROTOCOL_VERSION} is the
 * single major carried in the `ready` handshake and bumps only on a breaking
 * change.
 */

import type { CommandEnvelope, CommandResult } from "../commands";
import type { SdkEvent } from "../store";

/** Bridge protocol major version, carried in the `ready` handshake (`v`). */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Which capability ports the host services natively over the pipe. */
export interface NativePorts {
  /**
   * Storage is host-backed via `storage/*` messages. Default `true`; set
   * `false` to have the bridge use an in-memory store (tokens do not persist
   * across restarts).
   */
  storage?: boolean;
  /**
   * Fetch is host-backed via `fetch/*` messages. Always `true` in practice —
   * an embedded engine has no HTTP stack of its own — and accepted only for
   * symmetry. A `false` here is ignored.
   */
  fetch?: boolean;
}

/** Structured log line forwarded to the host over the pipe. */
export type BridgeLogLevel = "debug" | "info" | "warn" | "error";

/** host -> SDK. */
export type BridgeInbound =
  | { kind: "configure"; baseUrl: string; native?: NativePorts }
  | { kind: "command"; envelope: CommandEnvelope }
  | { kind: "subscribe"; sub: string; scope: string }
  | { kind: "unsubscribe"; sub: string }
  // Native port replies (correlated to an SDK-minted outbound `id`).
  | { kind: "fetch/response"; id: string; status: number; ok: boolean }
  | { kind: "fetch/chunk"; id: string; bytesBase64: string }
  | { kind: "fetch/done"; id: string }
  | { kind: "fetch/error"; id: string; message: string }
  | { kind: "storage/result"; id: string; value?: string | null };

/** SDK -> host. */
export type BridgeOutbound =
  | { kind: "ready"; v: number }
  | { kind: "result"; result: CommandResult }
  | { kind: "subscribed"; sub: string; scope: string; snapshot?: unknown }
  | { kind: "snapshot"; sub: string; scope: string; snapshot: unknown }
  | { kind: "event"; event: SdkEvent }
  | { kind: "fatal"; reason: string; message: string }
  | { kind: "error"; message: string; detail?: unknown }
  // Native port requests (host replies correlated by `id`).
  | {
      kind: "fetch/start";
      id: string;
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    }
  | { kind: "fetch/abort"; id: string }
  | { kind: "storage/get"; id: string; key: string }
  | { kind: "storage/set"; id: string; key: string; value: string }
  | { kind: "storage/delete"; id: string; key: string }
  | {
      kind: "log";
      level: BridgeLogLevel;
      message: string;
      fields?: Record<string, unknown>;
    };

/** The `send` primitive: hand one serialized outbound message to the host. */
export type SendFn = (message: string) => void;

/** A plain-object view of an unknown inbound value, or `null` if not an object. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
