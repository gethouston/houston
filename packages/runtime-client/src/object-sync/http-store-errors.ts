import {
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "./object-store";

export async function objectStoreResponseError(
  res: Response,
  method: string,
  key: string,
): Promise<Error> {
  const body = await res.text();
  const message = `object store ${method} ${key} failed (${res.status})${
    body ? `: ${body.slice(0, 200)}` : ""
  }`;
  if (res.status === 413) return new ObjectTooLargeError(key, message);
  if (res.status === 409) return new StoreFencedError(key, message);
  if (res.status === 412) return new StoreConflictError(key, message);
  return new Error(message);
}
