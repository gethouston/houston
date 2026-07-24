import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useAgentStore } from "../stores/agents";
import { useDraftStore } from "../stores/drafts";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { setActiveOrg } from "./engine";
import { queryClient } from "./query-client";

/**
 * Drop the whole client-side world when the signed-in identity changes — a
 * different account signs in, or the current one signs out (HOU-903).
 *
 * The gateway is the sole tenancy enforcer and never serves cross-tenant data;
 * this is pure client-side stale memory. Three things outlive an identity swap
 * and must be wiped, or the incoming account inherits the outgoing one's world:
 *
 *  1. The in-memory query cache. `queryClient.clear()` (stronger than
 *     `removeQueries`) is deliberate: query keys are NOT user-scoped — the
 *     gateway resolves the caller from the bearer + `x-houston-org` header — so
 *     EVERY cached read (agents, org, provider-connection states) belongs to the
 *     outgoing identity and would otherwise be served to the next account via
 *     stale-while-revalidate. Mirrors `resetCacheForSpaceChange`, but for the
 *     whole identity rather than one space.
 *  2. The zustand stores. They live outside React and survive the sign-out
 *     unmount, so their agents / workspaces / view state would carry over.
 *  3. The active-space pin (`x-houston-org`). A stale team slug from the
 *     outgoing identity would ride the next account's very first requests and
 *     the gateway would 403 them `not_member`.
 */
export function resetForIdentityChange(): void {
  queryClient.clear();
  useAgentStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useUIStore.getState().reset();
  useDraftStore.getState().reset();
  useAgentProvisioningStore.getState().reset();
  setActiveOrg(null);
}
