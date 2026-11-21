import type { HarnessBackend } from "./types";

const backends = new Map<string, HarnessBackend>();
let defaultBackend: HarnessBackend | undefined;

export function setDefaultBackend(backend: HarnessBackend): void {
  defaultBackend = backend;
}

export function registerBackend(
  providerId: string,
  backend: HarnessBackend,
): void {
  backends.set(providerId, backend);
}

export function backendFor(providerId: string): HarnessBackend {
  const backend = backends.get(providerId) ?? defaultBackend;
  if (!backend)
    throw new Error(
      `No harness backend for provider "${providerId}" and no default set`,
    );
  return backend;
}
