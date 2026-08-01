import { dirname } from "node:path";
import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import {
  currentCredentialScope,
  TEAM_CREDENTIAL_SCOPE,
} from "../session/acting-context";
import {
  authPathIn,
  type PiCred,
  readAuthFile,
  writeAuthFile,
} from "./auth-file";

/**
 * Houston's credential store: pi-ai's `CredentialStore` contract over
 * dataDir/auth.json (atomic 0600 writes via auth-file.ts) plus the synchronous
 * `get`/`has`/`set`/`remove`/`reload` surface Houston's turn-time paths need
 * (`providerConnected` runs on the sync turn path, and serve.ts writes auth.json
 * directly then calls `reload()`).
 *
 * pi ≤0.80.6 exported its own `AuthStorage` facade for this; 0.80.8 made
 * credential storage explicitly app-owned ("Login/logout orchestration is
 * app-owned" — pi-ai `CredentialStore`), with `ModelRuntime` doing auth
 * orchestration over whatever store the app provides. This is that store.
 *
 * SCOPE (HOU-976). One pod serves every member of a team space, so the store is
 * per acting identity: every method resolves `currentCredentialScope()` and
 * reads/writes THAT scope's file. `modelRuntime` needs no change — pi calls
 * `credentials.read(providerId)` inside `prepareRequest` on every `stream()`, so
 * the read happens inside the turn's `AsyncLocalStorage` subtree.
 *  - no acting identity → `<dataDir>/auth.json`, the pre-HOU-976 path and bytes
 *    (desktop, self-host, routines, every request without the header);
 *  - `u:<sub>` → `<dataDir>/auth-users/<sha256(sub)[:16]>.json`, same writer.
 * One entry per identity the pod has served — bounded by the space's membership.
 *
 * `modify` is the ONLY write path pi uses (OAuth refresh runs inside it), and
 * it is serialized per (scope, provider) so concurrent requests cannot
 * double-refresh a rotated token. Two members touch two files with two chains;
 * one member's concurrent turns share one file behind one chain. Houston is one
 * process per data dir (host + runtime share the process; the serve path's
 * direct writers live here too), so an in-process chain is the whole
 * mutual-exclusion story — matching auth-file.ts, which has always written
 * auth.json without a cross-process lock.
 */
interface ScopeState {
  readonly path: string;
  cache: Record<string, Credential>;
  /** Per-provider tail of the serialized `modify` chain. */
  readonly chains: Map<string, Promise<unknown>>;
}

export class HoustonAuthStore implements CredentialStore {
  /** Scope key → that scope's file, cache and write chains. */
  private readonly scopes = new Map<string, ScopeState>();
  /** The data dir the personal scopes' files live under. */
  private readonly dataDir: string;

  /** `authPath` is the TEAM file; personal scopes derive from its directory. */
  constructor(authPath: string) {
    this.dataDir = dirname(authPath);
    // Read the team file at construction, exactly as before: the desktop's
    // sync turn path expects a warm cache with no first-read latency. Bound to
    // the TEAM key explicitly — the constructor's path is the team file whatever
    // identity happens to be ambient at construction.
    this.scopes.set(TEAM_CREDENTIAL_SCOPE, {
      path: authPath,
      cache: readAuthFile(authPath) as Record<string, Credential>,
      chains: new Map(),
    });
  }

  /** The current acting identity's file + cache, opened on first use. */
  private scoped(): ScopeState {
    const { key } = currentCredentialScope();
    const open = this.scopes.get(key);
    if (open) return open;
    const path = authPathIn(this.dataDir, key);
    const state: ScopeState = {
      path,
      cache: readAuthFile(path) as Record<string, Credential>,
      chains: new Map(),
    };
    this.scopes.set(key, state);
    return state;
  }

  /** Re-read the current scope's auth file after a direct write (serve path). */
  reload(): void {
    const state = this.scoped();
    state.cache = readAuthFile(state.path) as Record<string, Credential>;
  }

  /** Sync read of the stored credential (possibly expired) — status/turn use. */
  get(providerId: string): Credential | undefined {
    return this.scoped().cache[providerId];
  }

  has(providerId: string): boolean {
    return this.get(providerId) !== undefined;
  }

  /** Sync store (connect flows: pasted key, captured setup token). */
  set(providerId: string, credential: Credential): void {
    this.setIn(this.scoped(), providerId, credential);
  }

  /** Sync removal (logout). Absent entries are a no-op. */
  remove(providerId: string): void {
    this.removeIn(this.scoped(), providerId);
  }

  /** The file the CURRENT scope reads and writes — diagnostics and tests. */
  currentPath(): string {
    return this.scoped().path;
  }

  private setIn(
    state: ScopeState,
    providerId: string,
    credential: Credential,
  ): void {
    state.cache = { ...state.cache, [providerId]: credential };
    this.persist(state);
  }

  private removeIn(state: ScopeState, providerId: string): void {
    if (state.cache[providerId] === undefined) return;
    const { [providerId]: _gone, ...rest } = state.cache;
    state.cache = rest;
    this.persist(state);
  }

  private persist(state: ScopeState): void {
    writeAuthFile(state.path, state.cache as Record<string, PiCred>);
  }

  // ---- pi-ai CredentialStore ----

  async read(providerId: string): Promise<Credential | undefined> {
    return this.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return Object.entries(this.scoped().cache).map(([providerId, cred]) => ({
      providerId,
      type: cred.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    // The scope is resolved HERE and the queued work is BOUND to it: a chained
    // continuation must write the file of the caller that queued it, never
    // whichever identity happens to be ambient when the chain drains.
    const state = this.scoped();
    const prev = state.chains.get(providerId) ?? Promise.resolve();
    const apply = async () => {
      const next = await fn(state.cache[providerId]);
      // Contract: `undefined` leaves the entry unchanged (NOT a delete).
      if (next !== undefined) this.setIn(state, providerId, next);
      return state.cache[providerId];
    };
    // Chain regardless of the previous op's outcome; rejections from `fn`
    // still propagate to THIS caller below.
    const run = prev.then(apply, apply);
    // The chain tail must never carry a rejection forward (it would replay
    // into unrelated later writes); the caller's `run` still rejects.
    state.chains.set(
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
    const state = this.scoped();
    const prev = state.chains.get(providerId) ?? Promise.resolve();
    const drop = () => this.removeIn(state, providerId);
    const run = prev.then(drop, drop);
    state.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }
}
