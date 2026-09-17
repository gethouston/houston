import type { OrgSummary } from "@houston/engine-adapter";
import { PERSONAL_WORKSPACE_ID } from "./space-id.ts";
import type { Workspace } from "./types.ts";

export type AssistantLanding =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "assistant"; slug: string };

export function assistantLanding(search: string): AssistantLanding {
  const values = new URLSearchParams(search).getAll("assistant");
  if (!values.length) return { kind: "absent" };
  if (values.length !== 1 || !/^[a-f0-9]{16}$/.test(values[0])) {
    return { kind: "invalid" };
  }
  return { kind: "assistant", slug: values[0] };
}

/** Invites and a synthetic personal row alone are never proof of membership. */
export function assistantLandingWorkspace(
  slug: string,
  memberships: readonly Pick<OrgSummary, "slug" | "kind">[],
  workspaces: readonly Workspace[],
): Workspace | null {
  const member = memberships.find((org) => org.slug === slug);
  if (!member) return null;
  const id = member.kind === "personal" ? PERSONAL_WORKSPACE_ID : `org:${slug}`;
  return workspaces.find((workspace) => workspace.id === id) ?? null;
}

interface LandingPorts {
  load: () => Promise<{
    memberships: Pick<OrgSummary, "slug" | "kind">[];
    workspaces: Workspace[];
  }>;
  current: () => boolean;
  select: (workspace: Workspace, workspaces: Workspace[]) => Promise<boolean>;
  open: () => void;
}

export async function driveAssistantLanding(
  slug: string,
  ports: LandingPorts,
): Promise<"opened" | "unavailable" | "cancelled"> {
  const { memberships, workspaces } = await ports.load();
  if (!ports.current()) return "cancelled";
  const workspace = assistantLandingWorkspace(slug, memberships, workspaces);
  if (!workspace) return "unavailable";
  if (!(await ports.select(workspace, workspaces))) return "cancelled";
  ports.open();
  return "opened";
}
