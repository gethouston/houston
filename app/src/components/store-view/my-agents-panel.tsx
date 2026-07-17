import { Button, ConfirmDialog } from "@houston-ai/core";
import type { MyAgent } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
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

  if (my.isPending) return <RowsSkeleton />;
  if (my.isError) {
    return (
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
    );
  }
  if (my.agents.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-ink-muted">
        {t("myAgents.empty")}
      </p>
    );
  }

  return (
    <>
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
