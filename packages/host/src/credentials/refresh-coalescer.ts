import type { CredentialActing, WorkspaceCredential } from "../ports";
import { isExpiring, type RefreshOptions, refreshCredential } from "./refresh";
import { credentialScopeKey } from "./scope-key";

const REFRESH_RESULT_TTL_MS = 30_000;

export type CredentialRefresher = (
  cred: WorkspaceCredential,
  opts?: RefreshOptions,
) => Promise<WorkspaceCredential>;

export type CredentialRefreshRun = {
  workspaceId: string;
  provider: string;
  acting?: CredentialActing;
  load: () => Promise<WorkspaceCredential | null>;
  persist: (cred: WorkspaceCredential) => Promise<void>;
  refreshOpts?: RefreshOptions;
  doRefresh?: CredentialRefresher;
  skewMs?: number;
};

export class CredentialGoneError extends Error {
  constructor(provider: string) {
    super(`${provider} credential was disconnected during refresh`);
    this.name = "CredentialGoneError";
  }
}

// WHY: Rotate-on-use providers reject concurrent refreshes as invalid_grant; one flight per key. ADR-0016
export class CredentialRefreshCoalescer {
  private readonly inFlight = new Map<string, Promise<WorkspaceCredential>>();
  private readonly results = new Map<
    string,
    { cred: WorkspaceCredential; at: number }
  >();

  constructor(
    private readonly doRefresh: CredentialRefresher = refreshCredential,
    private readonly now: () => number = Date.now,
  ) {}

  run(args: CredentialRefreshRun): Promise<WorkspaceCredential> {
    const key = this.keyOf(args.workspaceId, args.provider, args.acting);

    const cached = this.results.get(key);
    if (cached) {
      if (
        this.now() - cached.at < REFRESH_RESULT_TTL_MS &&
        !isExpiring(cached.cred, args.skewMs)
      )
        return Promise.resolve(cached.cred);
      this.results.delete(key);
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const flight: Promise<WorkspaceCredential> = this.refreshOnce(
      key,
      args,
    ).finally(() => {
      if (this.inFlight.get(key) === flight) this.inFlight.delete(key);
    });
    this.inFlight.set(key, flight);
    return flight;
  }

  forget(workspaceId: string, provider: string, acting?: CredentialActing) {
    this.results.delete(this.keyOf(workspaceId, provider, acting));
  }

  reset() {
    this.results.clear();
    this.inFlight.clear();
  }

  private async refreshOnce(
    key: string,
    args: CredentialRefreshRun,
  ): Promise<WorkspaceCredential> {
    const loaded = await args.load();
    if (loaded === null) throw new CredentialGoneError(args.provider);
    if (!isExpiring(loaded, args.skewMs)) {
      this.remember(key, loaded);
      return loaded;
    }

    const refresh = args.doRefresh ?? this.doRefresh;
    const rotated = await refresh(loaded, args.refreshOpts);
    await args.persist(rotated);
    this.remember(key, rotated);
    console.info(
      `[credential-refresh] rotated ${rotated.provider} credential for workspace ${args.workspaceId}`,
    );
    return rotated;
  }

  private remember(key: string, cred: WorkspaceCredential) {
    const at = this.now();
    for (const [k, entry] of this.results)
      if (at - entry.at >= REFRESH_RESULT_TTL_MS) this.results.delete(k);
    this.results.set(key, { cred, at });
  }

  private keyOf(
    workspaceId: string,
    provider: string,
    acting: CredentialActing | undefined,
  ): string {
    return `${workspaceId}:${credentialScopeKey(acting)}:${provider}`;
  }
}

export const sharedCredentialRefresher = new CredentialRefreshCoalescer();
