import { FAKE_HOST_URL, SEED_WORKSPACE_ID } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";

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
