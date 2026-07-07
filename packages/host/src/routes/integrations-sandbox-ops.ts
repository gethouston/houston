import type { ServerResponse } from "node:http";
import { enrichAccountsAcrossRegistry } from "../integrations/account-enrich";
import { providerForAction } from "../integrations/action-routing";
import {
  filterMatchesToGranted,
  grantedToolkits,
  resolveExecuteAccount,
  toolkitForAction,
} from "../integrations/grant-policy";
import type { GrantAccount } from "../integrations/grant-store";
import type { ActingContext } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import {
  mergeSearchAccounts,
  mergeSearchItems,
  searchAllProviders,
} from "../integrations/sandbox-fanout";
import { json } from "./http";

/**
 * The two runtime-facing sandbox operations, split out of the route shell to
 * keep each file within budget. The shell owns auth + acting-context + grant
 * resolution; these own the fan-out/merge (search) and provider-routed,
 * grant-enforced execution.
 *
 * `granted` is the acting agent's granted-account set, or null when there is no
 * local record (backward-compatible pass-through — also the gateway-fronted pod
 * case, where the gateway already enforced upstream).
 */
export interface SandboxOpCtx {
  registry: IntegrationRegistry;
  granted: GrantAccount[] | null;
  userId: string;
  acting: ActingContext | undefined;
  account: string | undefined;
}

/** Fan a search over every provider, tag matches, then (with a grant record)
 *  filter to the granted toolkits and attach the enriched granted accounts. */
export async function runSandboxSearch(
  ctx: SandboxOpCtx,
  query: string,
  res: ServerResponse,
): Promise<void> {
  const searches = await searchAllProviders(
    ctx.registry,
    ctx.userId,
    query,
    ctx.acting,
  );
  const items = mergeSearchItems(searches);
  if (!ctx.granted) {
    json(res, 200, { items, accounts: mergeSearchAccounts(searches) });
    return;
  }
  json(res, 200, {
    items: filterMatchesToGranted(items, grantedToolkits(ctx.granted)),
    accounts: await enrichAccountsAcrossRegistry(
      ctx.registry,
      ctx.userId,
      ctx.granted,
    ),
  });
}

/** Route the action to its owning provider (CUSTOM_* → custom) and execute,
 *  enforcing grants when the agent has a record. */
export async function runSandboxExecute(
  ctx: SandboxOpCtx,
  action: string,
  params: Record<string, unknown>,
  res: ServerResponse,
): Promise<void> {
  const provider = ctx.registry.get(
    providerForAction(action, ctx.registry.ids()),
  );
  // No record (or gateway-fronted) → forward the account verbatim; the upstream
  // (or the direct adapter's single account) resolves it.
  if (!ctx.granted) {
    json(
      res,
      200,
      await provider.execute(ctx.userId, action, params, {
        acting: ctx.acting,
        account: ctx.account,
      }),
    );
    return;
  }

  // Enforced: the action's toolkit must be granted, then pin one of that
  // toolkit's granted accounts (resolving any label the model passed).
  const toolkit = toolkitForAction(action, grantedToolkits(ctx.granted));
  if (!toolkit) {
    json(res, 403, { error: "toolkit_not_granted" });
    return;
  }
  const forToolkit = ctx.granted.filter(
    (a) => a.toolkit.toLowerCase() === toolkit.toLowerCase(),
  );
  const resolution = resolveExecuteAccount(
    await enrichAccountsAcrossRegistry(ctx.registry, ctx.userId, forToolkit),
    ctx.account,
  );
  if (!resolution.ok) {
    if (resolution.error === "account_required") {
      json(res, 400, {
        error: "account_required",
        accounts: resolution.accounts,
      });
    } else {
      json(res, 403, { error: "account_not_granted" });
    }
    return;
  }
  json(
    res,
    200,
    await provider.execute(ctx.userId, action, params, {
      acting: ctx.acting,
      account: resolution.connectionId,
    }),
  );
}
