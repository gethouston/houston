import { loadScopedBridge, retireBridge } from "./retirement";
import type { LocalModelBridgePorts } from "./types";

export async function cancelPreparedBridge(ports: LocalModelBridgePorts) {
  try {
    const journal = await loadScopedBridge(ports);
    if (journal && journal.phase !== "committed")
      await retireBridge(ports, journal);
  } catch (error) {
    // Cleanup remains durable; its failure must not replace the caller's AbortError.
    ports.report(error);
  }
}
