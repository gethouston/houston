import { objectStoreResponseError } from "./http-store-errors";
import type { WriteOptions } from "./object-store";
import type { FetchRetryOptions } from "./retry";

export async function deleteHttpObject({
  fetchRequest,
  url,
  headers,
  key,
  opts,
  capture,
}: {
  fetchRequest: (
    url: string,
    init?: RequestInit,
    extra?: Pick<FetchRetryOptions, "body" | "retryable">,
  ) => Promise<Response>;
  url: string;
  headers: Record<string, string>;
  key: string;
  opts?: WriteOptions;
  capture: (res: Response) => void;
}): Promise<void> {
  // As with PUT, a generation-guarded DELETE may have committed despite a
  // lost response.
  const res = await fetchRequest(
    url,
    {
      method: "DELETE",
      headers,
    },
    { retryable: opts?.ifGenerationMatch === undefined },
  );
  capture(res);
  if (!res.ok && res.status !== 404) {
    throw await objectStoreResponseError(res, "DELETE", key);
  }
}
