/**
 * The JS-side bridge dispatcher — the thin layer that turns the string pipe
 * into `HoustonSdk` calls and back. It implements `packages/sdk/BRIDGE.md`.
 *
 * Lifecycle: `createBridge` returns `{ receive, dispose }` and waits. The host
 * sends `configure` first (`baseUrl` + which ports are native); the dispatcher
 * builds ports, constructs the SDK via the injected factory, wires the event
 * channel, and replies `ready`. Thereafter it routes `command` -> `sdk.dispatch`
 * -> one `result`; `subscribe`/`unsubscribe` -> `sdk.subscribe` with an initial
 * `subscribed` snapshot then per-publish `snapshot` pushes; SDK events ->
 * `event`, except `session/tokenExpired` -> `fatal`; and native `fetch/*` +
 * `storage/*` replies -> the port host.
 * It never throws across the pipe: every inbound message yields a reply or a
 * documented no-reply (unknown `kind` inert per BRIDGE.md §4; port replies and
 * an idempotent unknown `unsubscribe` are silent by contract).
 */

import { TOKEN_EXPIRED_EVENT } from "../auth-expiry";
import type { CommandEnvelope } from "../commands";
import type { SdkConfig } from "../ports";
import type { HoustonSdk } from "../sdk";
import type { SdkEvent } from "../store";
import { PortHost } from "./ports";
import {
  asRecord,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeOutbound,
  type NativePorts,
  type SendFn,
} from "./wire";

/** Constructs the SDK once the host's `configure` supplies its config. */
export type SdkFactory = (config: SdkConfig) => HoustonSdk;

/** The dispatcher handle handed to the host. */
export interface Bridge {
  /** Deliver one inbound message string. Never throws. */
  receive(message: string): void;
  /** Tear down the SDK, subscriptions, and in-flight port ops. */
  dispose(): void;
}

/** Best-effort correlation id from an untrusted command envelope. */
function envelopeId(value: unknown): string {
  const id = asRecord(value)?.id;
  return typeof id === "string" ? id : "";
}

export function createBridge(sdkFactory: SdkFactory, send: SendFn): Bridge {
  const portHost = new PortHost(send);
  const subs = new Map<string, () => void>();
  let sdk: HoustonSdk | null = null;
  let offEvent: (() => void) | null = null;

  const emit = (msg: BridgeOutbound): void => send(JSON.stringify(msg));

  function onSdkEvent(event: SdkEvent): void {
    if (event.type === TOKEN_EXPIRED_EVENT) {
      emit({
        kind: "fatal",
        reason: "tokenExpired",
        message: "Houston session token expired; re-attach to continue.",
      });
    } else {
      emit({ kind: "event", event });
    }
  }

  function configure(msg: Record<string, unknown>): void {
    if (sdk) {
      emit({ kind: "error", message: "already configured" });
      return;
    }
    const baseUrl = msg.baseUrl;
    if (typeof baseUrl !== "string" || baseUrl.length === 0) {
      emit({
        kind: "error",
        message: "configure: baseUrl must be a non-empty string",
      });
      return;
    }
    const native = (asRecord(msg.native) ?? undefined) as
      | NativePorts
      | undefined;
    sdk = sdkFactory({ baseUrl, ports: portHost.ports(native) });
    offEvent = sdk.on(onSdkEvent);
    emit({ kind: "ready", v: BRIDGE_PROTOCOL_VERSION });
  }

  function onCommand(envelope: unknown): void {
    const id = envelopeId(envelope);
    if (!sdk) {
      emit({
        kind: "result",
        result: { id, ok: false, error: { message: "not configured" } },
      });
      return;
    }
    sdk
      .dispatch(envelope as CommandEnvelope)
      .then((result) => emit({ kind: "result", result }))
      .catch((err: unknown) =>
        emit({
          kind: "result",
          result: { id, ok: false, error: { message: String(err) } },
        }),
      );
  }

  function onSubscribe(msg: Record<string, unknown>): void {
    if (!sdk) {
      emit({ kind: "error", message: "subscribe before configure" });
      return;
    }
    const { sub, scope } = msg;
    if (typeof sub !== "string" || typeof scope !== "string") {
      emit({
        kind: "error",
        message: "subscribe requires string 'sub' and 'scope'",
      });
      return;
    }
    if (subs.has(sub)) {
      emit({ kind: "error", message: `subscription already active: ${sub}` });
      return;
    }
    const snapshot = sdk.getSnapshot(scope);
    emit({
      kind: "subscribed",
      sub,
      scope,
      ...(snapshot !== undefined ? { snapshot } : {}),
    });
    subs.set(
      sub,
      sdk.subscribe(scope, (snap) =>
        emit({ kind: "snapshot", sub, scope, snapshot: snap }),
      ),
    );
  }

  function onUnsubscribe(msg: Record<string, unknown>): void {
    const sub = msg.sub;
    if (typeof sub !== "string") {
      emit({ kind: "error", message: "unsubscribe requires string 'sub'" });
      return;
    }
    const off = subs.get(sub);
    if (!off) return; // unknown sub: idempotent no-op (BRIDGE.md §2)
    off();
    subs.delete(sub);
  }

  function receive(message: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      emit({ kind: "error", message: "malformed message: not JSON" });
      return;
    }
    const msg = asRecord(parsed);
    if (!msg || typeof msg.kind !== "string") {
      emit({
        kind: "error",
        message: "message must be an object with a string 'kind'",
      });
      return;
    }
    if (portHost.handle(msg)) return; // fetch/* + storage/* replies
    switch (msg.kind) {
      case "configure":
        configure(msg);
        return;
      case "command":
        onCommand(msg.envelope);
        return;
      case "subscribe":
        onSubscribe(msg);
        return;
      case "unsubscribe":
        onUnsubscribe(msg);
        return;
      default:
        return; // unknown kind: inert per additive versioning (BRIDGE.md §4)
    }
  }

  function dispose(): void {
    for (const off of subs.values()) off();
    subs.clear();
    offEvent?.();
    offEvent = null;
    sdk?.dispose();
    sdk = null;
    portHost.dispose();
  }

  return { receive, dispose };
}
