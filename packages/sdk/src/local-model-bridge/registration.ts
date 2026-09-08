import type { LocalBridgeDevice, LocalBridgeRegister } from "@houston/protocol";
import type { LocalBridgeJournal, LocalModelBridgePorts } from "./types";

export async function registerBridge(
  ports: LocalModelBridgePorts,
  journal: LocalBridgeJournal,
  device: LocalBridgeDevice,
  signal?: AbortSignal,
  legacy?: LocalBridgeRegister["legacy"],
) {
  const { identity, input, idempotencyKey } = journal;
  const descriptor = await ports.management.register(
    {
      ...device,
      agentId: identity.agentId,
      model: input.model,
      name: input.name,
      shared: input.shared,
      idempotencyKey,
      ...(legacy ? { legacy } : {}),
    },
    signal,
  );
  if (
    descriptor.orgId !== identity.orgId ||
    descriptor.userId !== identity.userId ||
    descriptor.deviceId !== device.deviceId ||
    descriptor.model !== input.model
  )
    throw new Error("bridge registration identity mismatch");
  return descriptor;
}
