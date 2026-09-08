import { BridgeStateError } from "./errors";
import type {
  LocalBridgeConnectInput,
  LocalBridgeJournal,
  LocalModelBridgePorts,
} from "./types";

export type ResumeBridge =
  | { kind: "saved"; journal: LocalBridgeJournal }
  | { kind: "migration"; input: LocalBridgeConnectInput }
  | { kind: "disabled" | "reconnect_required" };
export async function bridgeToResume(
  ports: LocalModelBridgePorts,
  signal: AbortSignal,
): Promise<ResumeBridge> {
  const identity = ports.management.identity;
  const journal = await ports.storage.load(identity);
  signal.throwIfAborted();
  if (journal) return { kind: "saved", journal };
  const candidate = await ports.native.legacyCandidate(identity);
  signal.throwIfAborted();
  if (!candidate) return { kind: "disabled" };
  const endpoint = await ports.management.legacyEndpoint(signal);
  signal.throwIfAborted();
  if (!endpoint || endpoint.bridge || !endpoint.baseUrl || !endpoint.model)
    return { kind: "reconnect_required" };
  const { model, name, contextWindow, reasoning, shared } = endpoint;
  return {
    kind: "migration",
    input: {
      model,
      name,
      contextWindow,
      reasoning,
      shared,
      targetBaseUrl: candidate.targetBaseUrl,
      appName: candidate.appName,
      localApiKey: candidate.localApiKey,
      legacy: { baseUrl: endpoint.baseUrl, proxyKey: candidate.proxyKey },
    },
  };
}

export async function migrationProof(
  ports: LocalModelBridgePorts,
  model: string,
  signal: AbortSignal,
) {
  const candidate = await ports.native.legacyCandidate(
    ports.management.identity,
  );
  signal.throwIfAborted();
  const endpoint = await ports.management.legacyEndpoint(signal);
  signal.throwIfAborted();
  if (!candidate || !endpoint || endpoint.model !== model || endpoint.bridge)
    throw new BridgeStateError("reconnect_required");
  return { baseUrl: endpoint.baseUrl, proxyKey: candidate.proxyKey };
}
