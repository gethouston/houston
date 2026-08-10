import {
  ClaimProfileCard,
  CreatorProfileScreen,
  ProfileEditorSignedOut,
  type ShareVisibility,
  SocialLinks,
  SortPills,
  shareVisibilityOf,
} from "@houston-ai/store";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../hooks/use-my-store-profile";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import {
  STORE_CATEGORIES,
  storeCategoryLabelKey,
} from "../../lib/store-categories";
import { useUIStore } from "../../stores/ui";
import {
  editListingLabels,
  ownedCardLabels,
  shareDialogLabels,
} from "./my-agents-labels";
import { actionLink } from "./store-link";
import { STORE_SITE_URL, useMyStoreAgents } from "./use-my-store-agents";

type Sort = "recent" | "installs";

/**
 * The app's owner view: THE SAME CreatorProfileScreen as everywhere else, in
 * owner mode (pencils + per-card manage menus) — engine-adapter wiring only.
 */
export function MyAgentsPanel({
  onOpenAgentSlug,
}: {
  onOpenAgentSlug: (slug: string) => void;
}) {
  const { t } = useTranslation("store");
  const { t: tPortable } = useTranslation("portable");
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const my = useMyStoreAgents(signedIn);
  const { profile, isPending: profilePending } = useMyStoreProfile();
  const setCreatorEditorOpen = useUIStore((s) => s.setCreatorEditorOpen);
  const [signingIn, setSigningIn] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const navLink = actionLink((href) => {
    if (href === "edit-profile") setCreatorEditorOpen(true);
    else if (href.startsWith("agent:"))
      onOpenAgentSlug(href.replace("agent:", ""));
  });

  if (!signedIn) {
    return (
      <ProfileEditorSignedOut
        title={t("me.signedOutTitle")}
        body={t("myAgents.signedOut")}
        signIn={t("myAgents.signIn")}
        onSignIn={() => {
          if (signingIn) return;
          setSigningIn(true);
          signInWithGoogle().catch((err) => {
            setSigningIn(false);
            showErrorToast(
              "store_sign_in",
              err instanceof Error ? err.message : String(err),
              err,
            );
          });
        }}
      />
    );
  }

  const loading = my.isPending || profilePending;
  if (!loading && !my.isError && !profile?.handle) {
    return (
      <ClaimProfileCard
        editHref="edit-profile"
        LinkComponent={navLink}
        labels={{
          title: t("me.hero.claimTitle"),
          body: t("me.hero.claimBody"),
          cta: t("me.hero.claimCta"),
        }}
      />
    );
  }

  const sorted = [...my.agents].sort((a, b) =>
    sort === "installs"
      ? b.installsCount - a.installsCount
      : (b.publishedAt ?? b.updatedAt).localeCompare(
          a.publishedAt ?? a.updatedAt,
        ),
  );

  return (
    <CreatorProfileScreen
      profile={
        profile
          ? {
              handle: profile.handle,
              displayName: profile.displayName ?? "",
              avatarUrl: profile.avatarUrl ?? undefined,
              verified: profile.verified,
              bio: profile.bio ?? undefined,
            }
          : undefined
      }
      agents={sorted}
      stats={{
        agents: my.agents.length,
        installs: my.agents.reduce(
          (total, agent) => total + agent.installsCount,
          0,
        ),
      }}
      socialLinks={
        profile?.links ? (
          <SocialLinks links={profile.links} className="mt-3" />
        ) : null
      }
      actions={
        <SortPills
          value={sort}
          options={[
            { value: "recent", label: t("browse.sortRecent") },
            { value: "installs", label: t("browse.sortInstalls") },
          ]}
          onChange={setSort}
        />
      }
      agentHref={(agent) => `agent:${agent.slug ?? ""}`}
      LinkComponent={navLink}
      loading={loading}
      failed={my.isError}
      onRetry={() => void my.refetch()}
      labels={{ loadFailed: t("loadFailed"), retry: t("retry") }}
      owner={{
        editHref: "edit-profile",
        busyId: my.agents.find((agent) => my.isBusy(agent.id))?.id ?? null,
        categories: STORE_CATEGORIES.map((slug) => ({
          slug,
          name: tPortable(storeCategoryLabelKey(slug)),
        })),
        onEditIdentity: async (id, identity) => {
          await my.editIdentity.mutateAsync({ id, identity });
        },
        shareHrefFor: (agent) =>
          agent.slug ? `${STORE_SITE_URL}/a/${agent.slug}` : null,
        onShareSelect: (id, next: ShareVisibility) => {
          const agent = my.agents.find((item) => item.id === id);
          if (!agent) return;
          const current = shareVisibilityOf(agent);
          if (next === "private") my.unpublish.mutate(id);
          else if (next === "hidden") {
            if (current === "public") my.makeUnlisted.mutate(id);
            else my.publish.mutate(id);
          } else {
            if (current === "private")
              void my.publish
                .mutateAsync(id)
                .then(() => my.requestPublic.mutate(id));
            else my.requestPublic.mutate(id);
          }
        },
        onDelete: (id) => my.remove.mutate(id),
        editAvatarLabel: t("me.hero.editAvatar"),
        editProfileLabel: t("me.hero.editProfile"),
        cardLabels: ownedCardLabels(t),
        editLabels: editListingLabels(t),
        shareLabels: shareDialogLabels(t),
      }}
    />
  );
}
