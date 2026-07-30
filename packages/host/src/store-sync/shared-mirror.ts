import {
  type ManifestObjectStore,
  probeSharedMirror,
  type SharedMirrorState,
  syncSharedMirror,
} from "@houston/runtime-client/object-sync";

const DEFAULT_PROBE_DEBOUNCE_MS = 15_000;

export interface SharedMirrorControllerOptions {
  store: ManifestObjectStore;
  mirrorDir: string;
  debounceMs?: number;
  now?: () => number;
  log: (message: string, error?: unknown) => void;
}

/**
 * Owns the two deliberately soft shared-cache refresh points. A single-flight
 * probe updates its baseline only after complete reconciliation, so a failed
 * partial pass is retried safely on a later probe.
 */
export class SharedMirrorController {
  private state: SharedMirrorState | undefined;
  private lastProbeAt: number | undefined;
  private inFlight: Promise<void> | undefined;

  constructor(private readonly options: SharedMirrorControllerOptions) {}

  /** Begin wake hydration without making host readiness wait on remote storage. */
  wake(): void {
    void this.requestRefresh("wake sync");
  }

  /** Refresh before a turn, joining wake work and debouncing remote probes. */
  beforeTurn(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const now = this.now();
    const debounceMs = this.options.debounceMs ?? DEFAULT_PROBE_DEBOUNCE_MS;
    if (this.lastProbeAt !== undefined && now - this.lastProbeAt < debounceMs) {
      return Promise.resolve();
    }
    return this.requestRefresh("turn-start probe");
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private requestRefresh(trigger: string): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.lastProbeAt = this.now();
    this.inFlight = probeSharedMirror(this.options.store)
      .then(async (snapshot) => {
        if (snapshot.state.fingerprint === this.state?.fingerprint) return;
        const result = await syncSharedMirror({
          store: this.options.store,
          mirrorDir: this.options.mirrorDir,
          snapshot,
        });
        this.state = result.state;
      })
      .catch((error) => {
        this.options.log(
          `[shared-mirror] ${trigger} failed; using current mirror`,
          error,
        );
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
}
