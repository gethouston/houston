import { AsyncLocalStorage } from "node:async_hooks";
import { accessDigest } from "@houston/protocol/access-digest";

export interface UsedTokenCapture {
  record(provider: string, access: string): void;
  digestFor(provider: string): string | undefined;
}

export function newUsedTokenCapture(): UsedTokenCapture {
  const digests = new Map<string, string>();
  return {
    record(provider, access) {
      digests.set(provider, accessDigest(access));
    },
    digestFor(provider) {
      return digests.get(provider);
    },
  };
}

const store = new AsyncLocalStorage<UsedTokenCapture>();

export function runWithUsedTokenCapture<T>(
  capture: UsedTokenCapture,
  fn: () => T,
): T {
  return store.run(capture, fn);
}

export function recordUsedToken(provider: string, access: string): void {
  store.getStore()?.record(provider, access);
}

export function currentUsedTokenDigest(provider: string): string | undefined {
  return store.getStore()?.digestFor(provider);
}
