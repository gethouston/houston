import { FAKE_HOST_URL, SEED_WORKSPACE_ID } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";

/**
 * The sidebar's stored order and grouping, served by the fake host through
 * `GET`/`PUT /v1/workspaces/:id/sidebar-layout`.
 *
 * Specs therefore ARRANGE by writing the layout to the host before the app
 * boots, and ASSERT by reading it back.
 */
const layoutUrl = (workspaceId: string) =>
  `${FAKE_HOST_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}/sidebar-layout`;

export interface SeedSidebarGroup {
  id: string;
  name: string;
  collapsed: boolean;
  agentIds: string[];
  icon?: string;
  color?: string;
}

export interface SeedSidebarLayout {
  groups: SeedSidebarGroup[];
  order: ({ kind: "group"; id: string } | { kind: "agent"; id: string })[];
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

/** The layout as the host holds it. */
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
