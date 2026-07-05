import type { HarnessBackend } from "./types";

/**
 * The per-provider backend registry for the long-lived server. A provider that
 * needs its own harness registers here; everything else resolves to the default
 * backend (pi). The per-request cloud runtime does NOT use this registry — it
 * builds a throwaway pi backend per turn — so this state is the server's alone.
 */

const backends = new Map<string, HarnessBackend>();
let defaultBackend: HarnessBackend | undefined;

/** Set the backend used for any provider without a specific registration. */
export function setDefaultBackend(backend: HarnessBackend): void {
  defaultBackend = backend;
}

/** Register a backend for a specific provider id (wins over the default). */
export function registerBackend(
  providerId: string,
  backend: HarnessBackend,
): void {
  backends.set(providerId, backend);
}

/**
 * The backend for a provider: its specific registration, else the default. Throws
 * if neither is set — a turn must never silently run on no backend.
 */
export function backendFor(providerId: string): HarnessBackend {
  const backend = backends.get(providerId) ?? defaultBackend;
  if (!backend)
    throw new Error(
      `No harness backend for provider "${providerId}" and no default set`,
    );
  return backend;
}
