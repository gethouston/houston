import type { CustomEndpoint, LocalBridgeDevice } from "@houston/protocol";
import {
  BridgeStateError,
  isAuthorizationFailure,
  isPermanentBridgeFailure,
} from "./errors";
import { sameBridgeIdentity } from "./identity";
import { migrationProof } from "./migration";
import { registerBridge } from "./registration";
import type {
  LocalBridgeConnectInput,
  LocalBridgeJournal,
  LocalModelBridgePorts,
} from "./types";

export function bridgeEndpoint(journal: LocalBridgeJournal): CustomEndpoint {
  const descriptor = journal.descriptor;
  if (!descriptor) throw new Error("bridge descriptor missing");
  const { model, name, contextWindow, reasoning, shared } = journal.input;
  return {
    baseUrl: descriptor.baseUrl,
    model,
    name,
    contextWindow,
    reasoning,
    shared,
    bridge: { id: descriptor.bridgeId, version: 1 },
  };
}
export async function prepareBridge(
  ports: LocalModelBridgePorts,
  device: LocalBridgeDevice,
  signal: AbortSignal,
  input?: LocalBridgeConnectInput,
): Promise<LocalBridgeJournal> {
  const identity = ports.management.identity;
  let journal = await ports.storage.load(identity);
  signal.throwIfAborted();
  if (journal && !sameBridgeIdentity(journal.identity, identity))
    throw new Error("bridge identity mismatch");
  if (input) {
    const { localApiKey: _key, legacy: _legacy, ...publicInput } = input;
    journal = {
      version: 1,
      identity: { ...identity },
      idempotencyKey: crypto.randomUUID(),
      phase: "prepared",
      ...(input.legacy ? { migration: true as const } : {}),
      input: publicInput,
    };
    await ports.storage.save(identity, journal);
  }
  if (!journal) throw new Error("bridge configuration missing");
  signal.throwIfAborted();
  if (!journal.descriptor) {
    const legacy =
      input?.legacy ??
      (journal.migration
        ? await migrationProof(ports, journal.input.model, signal)
        : undefined);
    const descriptor = await registerBridge(
      ports,
      journal,
      device,
      signal,
      legacy,
    );
    // Keep the prepared idempotency key durable if this write fails. Resume can recover the descriptor.
    journal = { ...journal, descriptor, phase: "registered" };
    await ports.storage.save(identity, journal);
    signal.throwIfAborted();
  }
  return journal;
}
export async function commitBridge(
  ports: LocalModelBridgePorts,
  journal: LocalBridgeJournal,
  signal: AbortSignal,
) {
  const descriptor = journal.descriptor;
  if (!descriptor) throw new Error("bridge descriptor missing");
  const remote = await ports.management.status(descriptor.bridgeId, signal);
  signal.throwIfAborted();
  if (remote.status !== "online")
    throw new BridgeStateError(
      remote.status === "revoked" ? "revoked" : "model_unavailable",
    );
  if (journal.phase === "committed") return journal;
  const ready = { ...journal, phase: "ready" as const };
  await ports.storage.save(journal.identity, ready);
  signal.throwIfAborted();
  try {
    await ports.management.saveEndpoint(bridgeEndpoint(journal), signal);
  } catch (error) {
    // An aborted/ambiguous network result is reconciled through the same idempotent endpoint save.
    if (
      !signal.aborted &&
      (isAuthorizationFailure(error) || isPermanentBridgeFailure(error))
    ) {
      await ports.management.revoke(descriptor.bridgeId, signal);
      await ports.storage.clear(journal.identity);
    }
    throw error;
  }
  const committed = { ...journal, phase: "committed" as const };
  await ports.storage.save(journal.identity, committed);
  signal.throwIfAborted();
  return committed;
}
