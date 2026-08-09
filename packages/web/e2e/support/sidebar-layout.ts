import { FAKE_HOST_URL, SEED_WORKSPACE_ID } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";

/**
 * The sidebar's stored order + grouping, on the SERVER — which is where the web
 * surface now keeps it. The fake host advertises `profile: "local"` (it models a
 * desktop/self-host deployment), so the adapter routes the layout through
 * `GET`/`PUT /v1/workspaces/:id/sidebar-layout` rather than `localStorage`; that
 * PUT is what drives the host's `GROUP.md` fan-out for team shared context.
 *
 * Specs therefore ARRANGE by writing the layout to the host before the app
 * boots, and ASSERT by reading it back — never through `page.evaluate` over
 * browser storage.
 */
const layoutUrl = (workspaceId: string) =>
  `${FAKE_HOST_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}/sidebar-layout`;

export interface SeedSidebarGroup {
  id: string;
  name: string;
  collapsed: boolean;
  agentIds: string[];
  context?: string;
  icon?: string;
  color?: string;
}

export interface SeedSidebarLayout {
  groups: SeedSidebarGroup[];
  ungroupedOrder: string[];
  defaultCollapsed?: boolean;
  defaultContext?: string;
}

/** Arrange the stored layout the app reads at boot. Server-to-server (no CORS),
 *  exactly like the other `__test__` arrangements, so it must run before
 *  `page.goto`. */
export async function seedSidebarLayout(
  request: APIRequestContext,
  layout: SeedSidebarLayout,
  workspaceId: string = SEED_WORKSPACE_ID,
): Promise<void> {
  const res = await request.put(layoutUrl(workspaceId), { data: layout });
  if (!res.ok()) {
    throw new Error(`seedSidebarLayout: ${res.status()} ${await res.text()}`);
  }
}

/** The layout as the host actually holds it — "was this written down?" is a
 *  server question now, never a storage one. */
export async function readSidebarLayout(
  request: APIRequestContext,
  workspaceId: string = SEED_WORKSPACE_ID,
): Promise<SeedSidebarLayout> {
  const res = await request.get(layoutUrl(workspaceId));
  if (!res.ok()) {
    throw new Error(`readSidebarLayout: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as SeedSidebarLayout;
}
