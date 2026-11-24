import type { WriteOptions } from "./object-store";

export interface WriteAuthority {
  bootId?: string;
  fence?: { token?: string };
  claim?: { token: string; bootId: string; conversationId: string };
}

export function storeWriteHeaders(
  authHeaders: Record<string, string>,
  opts: WriteOptions | undefined,
  { bootId, fence, claim }: WriteAuthority,
): Record<string, string> {
  const headers = { ...authHeaders };
  if (opts?.ifGenerationMatch !== undefined) {
    headers["X-Houston-If-Generation-Match"] = opts.ifGenerationMatch;
  }
  if (fence?.token !== undefined && bootId !== undefined) {
    headers["X-Houston-Fencing-Token"] = fence.token;
    headers["X-Houston-Boot-Id"] = bootId;
  } else if (claim) {
    headers["X-Houston-Claim-Token"] = claim.token;
    headers["X-Houston-Claim-Boot"] = claim.bootId;
    headers["X-Houston-Claim-Conversation"] = claim.conversationId;
  }
  return headers;
}
