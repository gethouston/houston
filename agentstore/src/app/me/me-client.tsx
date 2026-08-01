"use client";

import type {
  AgentIdentityPatch,
  AgentPatch,
  CreatorProfile,
  StoreAgentSummary,
  StoreCategory,
} from "@houston/agentstore-client";
import {
  ClaimProfileCard,
  CreatorProfileScreen,
  ProfileEditorSignedOut,
  type ShareVisibility,
  SocialLinks,
  SortPills,
  shareVisibilityOf,
} from "@houston-ai/store";
import Link from "next/link";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import { launchStoreInstall } from "@/lib/houston-launch";
import { shareUrlForSlug } from "@/lib/site-config";
import {
  deleteAgent,
  getMyProfile,
  listCategories,
  listMyAgents,
  patchAgent,
} from "@/lib/store-client";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      agents: StoreAgentSummary[];
      profile: CreatorProfile | null;
      categories: StoreCategory[];
    };

type Sort = "recent" | "installs";
const SORTS: ReadonlyArray<{ value: Sort; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "installs", label: "Most installed" },
];

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** The web owner view: THE SAME CreatorProfileScreen as the public page, in
 *  owner mode (pencils + per-card manage menus). */
export function MeClient() {
  const { status: sessionStatus, signIn, getToken } = useSession();
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<Sort>("recent");

  const reload = React.useCallback(async () => {
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      const [agents, profile, categories] = await Promise.all([
        listMyAgents(token),
        getMyProfile(token),
        listCategories(),
      ]);
      setLoad({ status: "ready", agents, profile, categories });
    } catch (err) {
      setLoad({ status: "error", message: errorText(err) });
    }
  }, [getToken]);

  React.useEffect(() => {
    if (sessionStatus === "signed-in") void reload();
  }, [sessionStatus, reload]);

  const runMutation = React.useCallback(
    async (id: string, mutate: (token: string) => Promise<void>) => {
      setPendingId(id);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session expired. Sign in again.");
        await mutate(token);
        await reload();
      } catch (err) {
        setLoad({ status: "error", message: errorText(err) });
      } finally {
        setPendingId(null);
      }
    },
    [getToken, reload],
  );

  if (sessionStatus === "unconfigured" || sessionStatus === "signed-out") {
    return (
      <ProfileEditorSignedOut
        title="Your agents"
        body="Sign in to see and manage the agents you have published."
        onSignIn={() => {
          void signIn().catch(() => {});
        }}
      />
    );
  }

  const ready = load.status === "ready" ? load : null;
  if (ready && ready.profile === null) {
    return <ClaimProfileCard editHref="/me/profile" LinkComponent={Link} />;
  }

  const sorted = ready
    ? [...ready.agents].sort((a, b) =>
        sort === "installs"
          ? b.installsCount - a.installsCount
          : (b.publishedAt ?? b.updatedAt).localeCompare(
              a.publishedAt ?? a.updatedAt,
            ),
      )
    : [];

  return (
    <CreatorProfileScreen
      profile={ready?.profile ?? undefined}
      agents={sorted}
      stats={
        ready
          ? {
              agents: ready.agents.length,
              installs: ready.agents.reduce(
                (total, agent) => total + agent.installsCount,
                0,
              ),
            }
          : undefined
      }
      socialLinks={
        ready?.profile ? (
          <SocialLinks links={ready.profile.links} className="mt-3" />
        ) : null
      }
      actions={<SortPills value={sort} options={SORTS} onChange={setSort} />}
      agentHref={(agent) => (agent.slug ? `/a/${agent.slug}` : "/me")}
      LinkComponent={Link}
      loading={sessionStatus === "loading" || load.status === "loading"}
      failed={load.status === "error"}
      onRetry={() => void reload()}
      onTryAgent={(agent) => {
        if (agent.slug) launchStoreInstall(agent.slug);
      }}
      owner={{
        editHref: "/me/profile",
        busyId: pendingId,
        categories: ready?.categories ?? [],
        onEditIdentity: async (id, identity) => {
          const token = await getToken();
          if (!token) throw new Error("Your session expired. Sign in again.");
          await patchAgent(token, id, {
            identity: identity as AgentIdentityPatch,
          } as AgentPatch);
          await reload();
        },
        shareHrefFor: (agent) =>
          agent.slug ? shareUrlForSlug(agent.slug) : null,
        onShareSelect: (id, next: ShareVisibility) => {
          const agent = sorted.find((item) => item.id === id);
          if (!agent) return;
          const current = shareVisibilityOf(agent);
          void runMutation(id, async (t) => {
            if (next === "private") {
              await patchAgent(t, id, { unpublish: true } as AgentPatch);
            } else if (next === "hidden") {
              await patchAgent(
                t,
                id,
                (current === "public"
                  ? { visibility: "unlisted" }
                  : { publish: true }) as AgentPatch,
              );
            } else {
              if (current === "private")
                await patchAgent(t, id, { publish: true } as AgentPatch);
              await patchAgent(t, id, { requestPublic: true } as AgentPatch);
            }
          });
        },
        onDelete: (id) => void runMutation(id, (t) => deleteAgent(t, id)),
      }}
    />
  );
}
