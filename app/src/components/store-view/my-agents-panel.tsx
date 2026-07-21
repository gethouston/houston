import { Button, ConfirmDialog } from "@houston-ai/core";
import type { MyAgent } from "@houston-ai/engine-client";
import { AtSign } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../hooks/use-my-store-profile";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
import { AnalyticsPanel } from "./analytics/analytics-panel";
import { MyAgentRow } from "./my-agent-row";
import { requestPublicMode } from "./store-view-model";
import { useMyStoreAgents } from "./use-my-store-agents";

/** Which confirm-gated action is pending, and on which agent. */
type Confirm = { kind: "delete" | "unpublish"; agent: MyAgent };

/**
 * The Agent Store's "my agents" tab: the signed-in owner's published agents in
 * the catalog row grammar, each with its lifecycle actions (request public,
 * make unlisted, unpublish, delete, see in store). Fully self-contained — its
 * own data hook, the ui store for the "see in store" deep link, and the app's
 * Google sign-in for the signed-out CTA. Destructive actions are confirm-gated.
 */
export function MyAgentsPanel() {
  const { t } = useTranslation("store");
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const my = useMyStoreAgents(signedIn);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setSigningIn(false);
      showErrorToast(
        "store_sign_in",
        err instanceof Error ? err.message : String(err),
        err,
      );
    }
  };

  const seeInStore = (agent: MyAgent) => {
    if (agent.slug) useUIStore.getState().setStoreFocusSlug(agent.slug);
  };

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("myAgents.signedOut")}</p>
        <Button
          className="rounded-full"
          disabled={signingIn}
          onClick={() => void handleSignIn()}
        >
          {t("myAgents.signIn")}
        </Button>
      </div>
    );
  }

  const rowsRegion = my.isPending ? (
    <RowsSkeleton />
  ) : my.isError ? (
    <div className="flex flex-col items-center gap-3 py-16">
      <p className="text-sm text-ink-muted">{t("loadFailed")}</p>
      <Button
        variant="outline"
        className="rounded-full"
        onClick={() => void my.refetch()}
      >
        {t("retry")}
      </Button>
    </div>
  ) : my.agents.length === 0 ? (
    <p className="py-16 text-center text-sm text-ink-muted">
      {t("myAgents.empty")}
    </p>
  ) : (
    <div className="flex flex-col gap-2">
      {my.agents.map((agent) => (
        <MyAgentRow
          key={agent.id}
          agent={agent}
          busy={my.isBusy(agent.id)}
          requestPublicMode={requestPublicMode(agent, {
            inFlight: my.isRequestingPublic(agent.id),
            requested: my.wasRequestedPublic(agent.id),
          })}
          onRequestPublic={() => my.requestPublic.mutate(agent.id)}
          onMakeUnlisted={() => my.makeUnlisted.mutate(agent.id)}
          onUnpublish={() => setConfirm({ kind: "unpublish", agent })}
          onDelete={() => setConfirm({ kind: "delete", agent })}
          onSeeInStore={() => seeInStore(agent)}
        />
      ))}
    </div>
  );

  return (
    <>
      <ProfileHeader />
      <div className="my-8">
        <AnalyticsPanel />
      </div>
      {rowsRegion}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={t(`myAgents.confirm.${confirm?.kind ?? "delete"}Title`)}
        description={t(`myAgents.confirm.${confirm?.kind ?? "delete"}Body`, {
          name: confirm?.agent.name ?? "",
        })}
        confirmLabel={t(`myAgents.confirm.${confirm?.kind ?? "delete"}Confirm`)}
        cancelLabel={t("myAgents.confirm.cancel")}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, agent } = confirm;
          if (kind === "delete") my.remove.mutate(agent.id);
          else my.unpublish.mutate(agent.id);
          setConfirm(null);
        }}
      />
    </>
  );
}

/**
 * The dashboard's identity header: the creator's claimed `@handle` with an
 * "Edit profile" button, or a claim call-to-action when no handle exists yet.
 * Both open the shared creator-profile editor (mounted app-wide by the user
 * menu) via the `creatorEditorOpen` UI flag.
 */
function ProfileHeader() {
  const { t } = useTranslation("store");
  const { profile, isPending } = useMyStoreProfile();
  const setCreatorEditorOpen = useUIStore((s) => s.setCreatorEditorOpen);
  const claimed = Boolean(profile?.handle);

  if (isPending) return <ProfileHeaderSkeleton />;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <AtSign className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {claimed ? `@${profile?.handle}` : t("profile.claimTitle")}
        </span>
      </div>
      <Button
        variant={claimed ? "outline" : "default"}
        className="rounded-full"
        onClick={() => setCreatorEditorOpen(true)}
      >
        {claimed ? t("profile.edit") : t("profile.claimCta")}
      </Button>
    </div>
  );
}

/**
 * Header placeholder while the creator profile query settles, so an existing
 * creator never flashes the "claim your handle" state before their `@handle`
 * resolves. Decorative only, mirrors the header's outer frame.
 */
function ProfileHeaderSkeleton() {
  return (
    <div
      aria-hidden
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <AtSign className="size-4 shrink-0 text-ink-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-chip" />
      </div>
      <div className="h-9 w-28 animate-pulse rounded-full bg-chip" />
    </div>
  );
}

/** Row placeholders while the owner list settles. Decorative only. */
function RowsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[76px] animate-pulse rounded-xl bg-chip" />
      ))}
    </div>
  );
}
