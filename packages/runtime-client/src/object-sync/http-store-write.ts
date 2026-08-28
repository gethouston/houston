import { objectStoreResponseError } from "./http-store-errors";
import { uploadFile } from "./http-store-upload";
import { parseObjectManifest } from "./object-manifest";
import type { WriteResult } from "./object-store";

/** Upload one object and normalize its generation response. */
export async function uploadHttpObject(input: {
  fetchRequest: Parameters<typeof uploadFile>[0];
  url: string;
  srcFile: string;
  key: string;
  headers: Record<string, string>;
  retryable: boolean;
  capture: (response: Response) => void;
}): Promise<WriteResult | undefined> {
  const response = await uploadFile(
    input.fetchRequest,
    input.url,
    input.srcFile,
    input.headers,
    input.retryable,
  );
  input.capture(response);
  if (!response.ok) {
    throw await objectStoreResponseError(response, "PUT", input.key);
  }
  const body: unknown = await response.json();
  const metadata = parseObjectManifest(
    { objects: [body] },
    `object store PUT ${input.key}`,
  )[0];
  if (!metadata) {
    throw new Error(`object store PUT ${input.key} returned a malformed body`);
  }
  const header = response.headers.get("X-Houston-Generation");
  const generation =
    metadata.generation ?? (header && header !== "0" ? header : undefined);
  return generation === undefined ? undefined : { generation };
}
