import type { LocalBridgeDevice } from "@houston/protocol";
import { startBridgeNative, withNativeCancellation } from "./native-start";
import { commitBridge, prepareBridge } from "./transaction";
import type {
  LocalBridgeConnectInput,
  LocalBridgeJournal,
  LocalBridgeSnapshot,
  LocalModelBridgePorts,
} from "./types";

export async function openBridge(
  ports: LocalModelBridgePorts,
  signal: AbortSignal,
  input?: LocalBridgeConnectInput,
) {
  const identity = ports.management.identity;
  const device = await ports.native.device(identity);
  signal.throwIfAborted();
  let journal = await prepareBridge(ports, device, signal, input);
  const descriptor = journal.descriptor;
  if (!descriptor) throw new Error("bridge descriptor missing");
  const session = await ports.management.session(
    descriptor.bridgeId,
    device,
    signal,
  );
  signal.throwIfAborted();
  const url = new URL(session.connectUrl);
  const environment = new URL(identity.environment);
  if (
    url.protocol !== "wss:" ||
    url.host !== environment.host ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/v1/local-model-bridges/${descriptor.bridgeId}/connect` ||
    session.bridgeId !== descriptor.bridgeId
  )
    throw new Error("invalid bridge connection address");
  const localApiKey =
    input?.localApiKey ??
    (journal.migration
      ? (await ports.native.legacyCandidate(identity))?.localApiKey
      : undefined);
  signal.throwIfAborted();
  const ready = await startBridgeNative(
    ports,
    {
      identity,
      bridgeId: descriptor.bridgeId,
      connectUrl: session.connectUrl,
      ticket: session.ticket,
      targetBaseUrl: journal.input.targetBaseUrl,
      model: journal.input.model,
      ...(localApiKey ? { localApiKey } : {}),
    },
    signal,
  );
  signal.throwIfAborted();
  if (
    ready.generation !== session.generation ||
    Date.parse(ready.sessionExpiresAt) !== Date.parse(session.sessionExpiresAt)
  )
    throw new Error("bridge session mismatch");
  journal = await commitBridge(ports, journal, signal);
  if (journal.migration || (await ports.native.legacyCandidate(identity))) {
    await ports.native.completeMigration(identity);
    signal.throwIfAborted();
  }
  return { journal, device, ready };
}
export function renewalDelay(expiresAt: string, now: number) {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw new Error("bridge session expired");
  return Math.max(1, remaining - Math.min(120_000, remaining / 2));
}
export async function savedBridge(
  ports: LocalModelBridgePorts,
): Promise<LocalBridgeJournal | null> {
  return ports.storage.load(ports.management.identity);
}

export async function renewBridge(
  ports: LocalModelBridgePorts,
  snapshot: LocalBridgeSnapshot,
  device: LocalBridgeDevice,
  signal: AbortSignal,
) {
  if (!snapshot.descriptor || snapshot.generation === undefined)
    throw new Error("bridge session unavailable");
  const session = await ports.management.session(
    snapshot.descriptor.bridgeId,
    device,
    signal,
    snapshot.generation,
  );
  signal.throwIfAborted();
  if (session.generation !== snapshot.generation)
    throw new Error("bridge renewal generation mismatch");
  await withNativeCancellation(ports, signal, () =>
    ports.native.renew(session.ticket),
  );
  signal.throwIfAborted();
  return session.sessionExpiresAt;
}
