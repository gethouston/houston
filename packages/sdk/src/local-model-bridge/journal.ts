import { sameBridgeIdentity } from "./identity";
import type {
  LocalBridgeJournal,
  LocalBridgeStoragePort,
  LocalModelBridgePorts,
} from "./types";

/** Publish only durable, owned state, including writes that finish after cancellation. */
export function observeBridgeJournal(
  ports: LocalModelBridgePorts,
  publish: (journal: LocalBridgeJournal | null) => void,
): LocalBridgeStoragePort {
  const identity = ports.management.identity;
  const owned = (journal: LocalBridgeJournal | null) => {
    if (journal && !sameBridgeIdentity(journal.identity, identity))
      throw new Error("bridge identity mismatch");
  };
  return {
    async load(scope) {
      const journal = await ports.storage.load(scope);
      // Let the scoped lifecycle reject foreign data without exposing it during discovery.
      if (!journal || sameBridgeIdentity(journal.identity, identity))
        publish(journal);
      return journal;
    },
    async save(scope, journal) {
      owned(journal);
      await ports.storage.save(scope, journal);
      publish(journal);
    },
    async clear(scope) {
      await ports.storage.clear(scope);
      publish(null);
    },
  };
}
