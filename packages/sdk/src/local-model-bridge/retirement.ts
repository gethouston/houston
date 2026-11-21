import { isBridgeAbsent, isRegistrationRefusal } from "./errors";
import { sameBridgeIdentity } from "./identity";
import { registerBridge } from "./registration";
import type { LocalBridgeJournal, LocalModelBridgePorts } from "./types";

export function bridgeIsRetiring(journal: LocalBridgeJournal) {
  return journal.phase === "retiring" || journal.phase === "disconnecting";
}

export async function loadScopedBridge(ports: LocalModelBridgePorts) {
  const journal = await ports.storage.load(ports.management.identity);
  if (
    journal &&
    !sameBridgeIdentity(journal.identity, ports.management.identity)
  )
    throw new Error("bridge identity mismatch");
  return journal;
}

export async function markBridgeRetiring(
  ports: LocalModelBridgePorts,
  journal: LocalBridgeJournal,
  phase: "retiring" | "disconnecting" = journal.phase === "disconnecting"
    ? "disconnecting"
    : "retiring",
): Promise<LocalBridgeJournal> {
  if (!sameBridgeIdentity(journal.identity, ports.management.identity))
    throw new Error("bridge identity mismatch");
  if (journal.phase === phase) return journal;
  const retiring = { ...journal, phase };
  await ports.storage.save(journal.identity, retiring);
  return retiring;
}

export async function retireBridge(
  ports: LocalModelBridgePorts,
  journal: LocalBridgeJournal,
  signal?: AbortSignal,
) {
  let retiring = await markBridgeRetiring(ports, journal);
  signal?.throwIfAborted();
  if (!retiring.descriptor) {
    const device = await ports.native.device(retiring.identity);
    signal?.throwIfAborted();
    let descriptor: Awaited<ReturnType<typeof registerBridge>>;
    try {
      descriptor = await registerBridge(ports, retiring, device, signal);
    } catch (error) {
      if (signal?.aborted || !isRegistrationRefusal(error)) throw error;
      await forgetRetiring(ports, retiring, signal);
      return;
    }
    retiring = { ...retiring, descriptor };
    await ports.storage.save(retiring.identity, retiring);
    signal?.throwIfAborted();
  }
  if (!retiring.descriptor) throw new Error("bridge descriptor missing");
  try {
    if (signal)
      await ports.management.revoke(retiring.descriptor.bridgeId, signal);
    else await ports.management.revoke(retiring.descriptor.bridgeId);
  } catch (error) {
    if (!isBridgeAbsent(error)) throw error;
  }
  signal?.throwIfAborted();
  await forgetRetiring(ports, retiring, signal);
}

async function forgetRetiring(
  ports: LocalModelBridgePorts,
  retiring: LocalBridgeJournal,
  signal?: AbortSignal,
) {
  if (retiring.phase === "disconnecting") {
    await ports.management.clearEndpoint(signal);
    signal?.throwIfAborted();
  }
  await ports.storage.clear(retiring.identity);
}
