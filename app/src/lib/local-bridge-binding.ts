import {
  type LocalBridgeSnapshot,
  LocalModelBridgeController,
} from "@houston/sdk";
import { useAgentStore } from "../stores/agents";
import { getEngine } from "./engine";
import {
  desktopBridgePorts,
  reportLocalBridgeError,
} from "./local-bridge-ports";

const disabled: LocalBridgeSnapshot = { status: "disabled", journal: null };
let snapshot = disabled;
let epoch = 0;
let selectedKey: string | undefined;
let current: LocalModelBridgeController | null = null;
let pending: Promise<LocalModelBridgeController | null> | undefined;
const disposals = new Map<LocalModelBridgeController, Promise<void>>();
const listeners = new Set<() => void>();

function publish(next: LocalBridgeSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export const localBridgeSnapshot = () => snapshot;
export function subscribeLocalBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Scope changes invalidate callbacks synchronously, before any async teardown. */
export function invalidateLocalBridgeBinding(): void {
  epoch++;
  selectedKey = undefined;
  pending = undefined;
  const previous = current;
  current = null;
  if (previous) {
    const stop = previous.dispose();
    disposals.set(previous, stop);
    void stop.catch(reportLocalBridgeError);
  }
  publish(disabled);
}

export function localBridgeController(
  userId: string,
): Promise<LocalModelBridgeController | null> {
  const environment = window.__HOUSTON_ENGINE__?.baseUrl;
  const org = window.__HOUSTON_ACTIVE_ORG__ ?? null;
  const agent = useAgentStore.getState().current?.id ?? null;
  const key = JSON.stringify([environment, org, agent, userId]);
  if (selectedKey === key && pending) return pending;
  invalidateLocalBridgeBinding();
  selectedKey = key;
  const captured = epoch;
  pending = (async () => {
    for (const [retired, stopped] of disposals) {
      try {
        await stopped;
      } catch {
        // The initial failure was reported. Retry teardown before any new scope starts.
        await retired.dispose();
      }
      disposals.delete(retired);
    }
    if (captured !== epoch)
      throw new DOMException("Workspace changed", "AbortError");
    const access = await getEngine().getLocalModelBridgeAccess(userId);
    if (captured !== epoch)
      throw new DOMException("Workspace changed", "AbortError");
    if (!access) return null;
    if (access.identity.userId !== userId || access.identity.agentId !== agent)
      throw new Error("Local model identity changed");
    const controller = new LocalModelBridgeController(
      desktopBridgePorts(access),
    );
    current = controller;
    controller.subscribe((state) => {
      if (captured === epoch) publish(state);
    });
    return controller;
  })().catch((error: unknown) => {
    if (captured === epoch) pending = undefined;
    throw error;
  });
  return pending;
}

export async function wakeLocalBridge(): Promise<void> {
  await current?.wake();
}
