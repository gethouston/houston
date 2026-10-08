import type {
  PushDeviceRegistration,
  PushDeviceResponse,
  PushPresence,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";

/**
 * Register this installation for remote notifications.
 * @assistant group:settings
 * @assistant hidden: a native device's private FCM token and installation id are required.
 */
export async function registerDevice(
  scope: HttpScope,
  deviceId: string,
  input: PushDeviceRegistration,
  signal?: AbortSignal,
): Promise<PushDeviceResponse> {
  const response = await httpRequest(
    scope,
    `/v1/me/push/devices/${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
      signal,
    },
  );
  return (await response.json()) as PushDeviceResponse;
}

/**
 * Stop remote notifications for this installation.
 * @assistant group:settings
 * @assistant hidden: only the device being unregistered can identify its installation.
 */
export async function unregisterDevice(
  scope: HttpScope,
  deviceId: string,
  signal?: AbortSignal,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/me/push/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE", signal },
  );
}

/**
 * Report whether this client is in the foreground in the active space.
 * @assistant group:settings
 * @assistant hidden: presence must reflect the actual client window, not a chat action.
 */
export async function putPushPresence(
  scope: HttpScope,
  input: PushPresence,
  signal?: AbortSignal,
): Promise<void> {
  await httpRequest(scope, "/v1/me/push/presence", {
    method: "PUT",
    body: JSON.stringify(input),
    signal,
  });
}
