import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { type PiCred, readAuthFile, writeAuthFile } from "./auth-file";

/**
 * Houston's single-user credential store: pi-ai's `CredentialStore` contract
 * over the SAME dataDir/auth.json (atomic 0600 writes via auth-file.ts) plus
 * the synchronous `get`/`has`/`set`/`remove`/`reload` surface Houston's
 * turn-time paths need (`providerConnected` runs on the sync turn path, and
 * serve.ts writes auth.json directly then calls `reload()`).
 *
 * pi ≤0.80.6 exported its own `AuthStorage` facade for this; 0.80.8 made
 * credential storage explicitly app-owned ("Login/logout orchestration is
 * app-owned" — pi-ai `CredentialStore`), with `ModelRuntime` doing auth
 * orchestration over whatever store the app provides. This is that store.
 *
 * `modify` is the ONLY write path pi uses (OAuth refresh runs inside it), and
 * it is serialized per provider so concurrent requests cannot double-refresh a
 * rotated token. Houston is one process per data dir (host + runtime share the
 * process; the serve path's direct writers live here too), so an in-process
 * chain is the whole mutual-exclusion story — matching auth-file.ts, which has
 * always written auth.json without a cross-process lock.
 */
export class HoustonAuthStore implements CredentialStore {
  private cache: Record<string, Credential>;
  /** Per-provider tail of the serialized `modify` chain. */
  private chains = new Map<string, Promise<unknown>>();

  constructor(private readonly authPath: string) {
    this.cache = readAuthFile(authPath) as Record<string, Credential>;
  }

  /** Re-read auth.json after a direct file write (the serve path). */
  reload(): void {
    this.cache = readAuthFile(this.authPath) as Record<string, Credential>;
  }

  /** Sync read of the stored credential (possibly expired) — status/turn use. */
  get(providerId: string): Credential | undefined {
    return this.cache[providerId];
  }

  has(providerId: string): boolean {
    return this.cache[providerId] !== undefined;
  }

  /** Sync store (connect flows: pasted key, captured setup token). */
  set(providerId: string, credential: Credential): void {
    this.cache = { ...this.cache, [providerId]: credential };
    this.persist();
  }

  /** Sync removal (logout). Absent entries are a no-op. */
  remove(providerId: string): void {
    if (this.cache[providerId] === undefined) return;
    const { [providerId]: _gone, ...rest } = this.cache;
    this.cache = rest;
    this.persist();
  }

  private persist(): void {
    writeAuthFile(this.authPath, this.cache as Record<string, PiCred>);
  }

  // ---- pi-ai CredentialStore ----

  async read(providerId: string): Promise<Credential | undefined> {
    return this.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.cache).map(([providerId, cred]) => ({
      providerId,
      type: cred.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const prev = this.chains.get(providerId) ?? Promise.resolve();
    // Chain regardless of the previous op's outcome; rejections from `fn`
    // still propagate to THIS caller below.
    const run = prev.then(
      async () => {
        const next = await fn(this.get(providerId));
        // Contract: `undefined` leaves the entry unchanged (NOT a delete).
        if (next !== undefined) this.set(providerId, next);
        return this.get(providerId);
      },
      async () => {
        const next = await fn(this.get(providerId));
        if (next !== undefined) this.set(providerId, next);
        return this.get(providerId);
      },
    );
    // The chain tail must never carry a rejection forward (it would replay
    // into unrelated later writes); the caller's `run` still rejects.
    this.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }

  async delete(providerId: string): Promise<void> {
    await this.modifyDelete(providerId);
  }

  /** Serialize deletes against in-flight `modify` chains too. */
  private modifyDelete(providerId: string): Promise<void> {
    const prev = this.chains.get(providerId) ?? Promise.resolve();
    const run = prev.then(
      () => this.remove(providerId),
      () => this.remove(providerId),
    );
    this.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }
}
