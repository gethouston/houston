import {
  type GatewayFetchDeps,
  gatewayFetch,
  liveGatewayDeps,
} from "../gateway-fetch.ts";

export type AccountDeletionFailure = "team_member" | "network" | "http";

export class AccountDeletionError extends Error {
  readonly kind: AccountDeletionFailure;
  readonly httpStatus?: number;
  constructor(
    kind: AccountDeletionFailure,
    opts?: { httpStatus?: number; cause?: unknown },
  ) {
    super(`account deletion failed: ${kind}`, { cause: opts?.cause });
    this.name = "AccountDeletionError";
    this.kind = kind;
    this.httpStatus = opts?.httpStatus;
  }
}

export async function requestAccountDeletion(
  deps: GatewayFetchDeps,
): Promise<void> {
  let res: Response | null;
  try {
    res = await gatewayFetch(deps, "/v1/me", {
      method: "DELETE",
      orgScoped: false,
    });
  } catch (e) {
    throw new AccountDeletionError("network", { cause: e });
  }
  if (!res) throw new AccountDeletionError("http", { httpStatus: 401 });
  if (res.status === 204) return;
  if (res.status === 409) {
    throw new AccountDeletionError("team_member", { httpStatus: 409 });
  }
  throw new AccountDeletionError("http", { httpStatus: res.status });
}

export function accountDeletionAvailable(input: {
  identityConfigured: boolean;
  hasSession: boolean;
  isTauri: boolean;
  hostedGateway: boolean;
}): boolean {
  if (!input.identityConfigured || !input.hasSession) return false;
  return input.hostedGateway || !input.isTauri;
}

export function deleteHostedAccount(): Promise<void> {
  const deps = liveGatewayDeps();
  if (!deps) {
    throw new AccountDeletionError("network", {
      cause: new Error("account deletion unavailable: no gateway configured"),
    });
  }
  return requestAccountDeletion(deps);
}
