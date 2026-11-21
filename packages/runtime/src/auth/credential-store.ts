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
import {
  maskAccessOnly,
  needsServeSync,
  runEmptyRefreshServeSync,
} from "./empty-refresh-guard";
import { recordUsedToken } from "./used-token";

interface ScopeState {
  readonly path: string;
  cache: Record<string, Credential>;
  readonly chains: Map<string, Promise<unknown>>;
}

export class HoustonAuthStore implements CredentialStore {
  private readonly scopes = new Map<string, ScopeState>();
  private readonly dataDir: string;

  constructor(authPath: string) {
    this.dataDir = dirname(authPath);
    this.scopes.set(TEAM_CREDENTIAL_SCOPE, {
      path: authPath,
      cache: readAuthFile(authPath) as Record<string, Credential>,
      chains: new Map(),
    });
  }

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

  reload(): void {
    const state = this.scoped();
    state.cache = readAuthFile(state.path) as Record<string, Credential>;
  }

  get(providerId: string): Credential | undefined {
    return this.scoped().cache[providerId];
  }

  has(providerId: string): boolean {
    return this.get(providerId) !== undefined;
  }

  set(providerId: string, credential: Credential): void {
    this.setIn(this.scoped(), providerId, credential);
  }

  remove(providerId: string): void {
    this.removeIn(this.scoped(), providerId);
  }

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

  async read(providerId: string): Promise<Credential | undefined> {
    if (needsServeSync(this.get(providerId), Date.now()))
      await runEmptyRefreshServeSync();
    const cred = this.get(providerId);
    if (cred?.type === "oauth" && cred.access)
      recordUsedToken(providerId, cred.access);
    return cred;
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
    const state = this.scoped();
    const prev = state.chains.get(providerId) ?? Promise.resolve();
    const apply = async () => {
      const next = await fn(maskAccessOnly(state.cache[providerId]));
      if (next !== undefined) this.setIn(state, providerId, next);
      const settled = state.cache[providerId];
      if (settled?.type === "oauth" && settled.access)
        recordUsedToken(providerId, settled.access);
      return settled;
    };
    const run = prev.then(apply, apply);
    state.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }

  async delete(providerId: string): Promise<void> {
    await this.modifyDelete(providerId);
  }

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
