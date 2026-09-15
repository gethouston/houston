/**
 * `local-bridge` category: outbound transport to a model server running on this
 * machine or its LAN, plus the secure device journal that remembers it. The
 * engine cannot reach a user's `localhost`, so the shell holds this tunnel.
 */

import type { LocalBridgeDevice, LocalBridgeIdentity } from "@houston/protocol";
import type { LocalBridgeJournal, LocalBridgeNativePort } from "@houston/sdk";
import type { DetectedServer } from "../local-model";
import { invokeNative } from "./invoke.ts";

export function osDetectLocalModels(): Promise<DetectedServer[]> {
  return invokeNative<DetectedServer[]>("detect_local_models");
}

export function osLocalBridgeDevice(
  identity: LocalBridgeIdentity,
): Promise<LocalBridgeDevice> {
  return invokeNative<LocalBridgeDevice>("local_bridge_device", { identity });
}

export function osLocalBridgeLegacyCandidate(
  identity: LocalBridgeIdentity,
): ReturnType<LocalBridgeNativePort["legacyCandidate"]> {
  return invokeNative("local_bridge_legacy_candidate", { identity });
}

export function osCompleteBridgeMigration(
  identity: LocalBridgeIdentity,
): Promise<void> {
  return invokeNative<void>("local_bridge_complete_migration", { identity });
}

export function osStartLocalBridge(
  args: Parameters<LocalBridgeNativePort["start"]>[0],
): ReturnType<LocalBridgeNativePort["start"]> {
  return invokeNative("start_local_bridge", { args });
}

export function osRenewLocalBridge(
  identity: LocalBridgeIdentity,
  ticket: string,
): Promise<void> {
  return invokeNative<void>("renew_local_bridge", { identity, ticket });
}

export function osSavedBridgeTarget(
  identity: LocalBridgeIdentity,
): Promise<LocalBridgeJournal | null> {
  return invokeNative<LocalBridgeJournal | null>("saved_bridge_target", {
    identity,
  });
}

export function osSaveBridgeTarget(
  identity: LocalBridgeIdentity,
  journal: LocalBridgeJournal,
): Promise<void> {
  return invokeNative<void>("save_bridge_target", { identity, journal });
}

export function osForgetBridgeTarget(
  identity: LocalBridgeIdentity,
): Promise<void> {
  return invokeNative<void>("forget_bridge_target", { identity });
}

export function osStopLocalBridge(
  identity: LocalBridgeIdentity,
): Promise<void> {
  return invokeNative<void>("stop_local_bridge", { identity });
}
