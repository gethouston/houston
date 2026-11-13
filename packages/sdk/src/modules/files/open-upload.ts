import {
  type OpenUploadRequest,
  parseUploadSession,
  type UploadSession,
} from "@houston/wire-types";
import type { SdkPorts } from "../../ports";
import { throwIfAborted } from "../abortable-wait";
import { type HttpScope, httpRequest, SdkHttpError } from "../http";
import {
  UploadSessionsUnavailableError,
  UploadTransferError,
  uploadRefusal,
} from "./upload-errors";

// Ports identify one SDK lifetime; each host/agent has its own availability.
const unavailable = new WeakMap<SdkPorts, Set<string>>();

/** Opens a resumable upload session.
 * @assistant group:files hidden: device upload plumbing; the picker supplies the bytes.
 * @assistant hands: request_hands_on(files)
 */
export async function openUpload(
  scope: HttpScope,
  agentId: string,
  request: OpenUploadRequest,
  signal?: AbortSignal,
): Promise<UploadSession> {
  throwIfAborted(signal);
  const key = `${scope.baseUrl}/agents/${encodeURIComponent(agentId)}`;
  if (unavailable.get(scope.ports)?.has(key))
    throw new UploadSessionsUnavailableError();
  try {
    const res = await httpRequest(
      scope,
      `/agents/${encodeURIComponent(agentId)}/uploads`,
      {
        method: "POST",
        body: JSON.stringify(request),
        signal,
      },
    );
    const session = parseUploadSession(await res.json());
    if (!session)
      throw new UploadTransferError("Invalid upload session response");
    return session;
  } catch (error) {
    if (error instanceof SdkHttpError && error.status === 404) {
      const keys = unavailable.get(scope.ports) ?? new Set<string>();
      keys.add(key);
      unavailable.set(scope.ports, keys);
      throw new UploadSessionsUnavailableError();
    }
    throw uploadRefusal(error);
  }
}
