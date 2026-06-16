import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { AsyncButton, cn } from "@houston-ai/core";
import {
  useConnections,
  useResetConnections,
} from "../../../hooks/queries";
import { useComposioAuth } from "../../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../../composio-auth-dialog";
import { SetupCard } from "../setup-card";

interface ToolsMissionProps {
  eyebrow: string;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Connect step — sign the user into Composio (the account-level token) so the
 * assistant can use their apps. Per-toolkit connections are still posted by the
 * agent in the email step as connect cards. Next is gated on
 * `useConnections().status === "ok"`, so the user can't skip past connecting.
 */
export function ToolsMission({ eyebrow, onBack, onContinue }: ToolsMissionProps) {
  const { t } = useTranslation("setup");
  const { data: status, isLoading } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const isSignedIn = status?.status === "ok";

  const handleSignIn = useCallback(() => auth.startAuth(), [auth]);

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.tools.title")}
      subtitle={t("tutorial.missions.tools.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
      onNext={onContinue}
      nextLabel={t("tutorial.missions.tools.continue")}
      nextDisabled={!isSignedIn}
      helper={isSignedIn ? t("tutorial.missions.tools.continueHint") : undefined}
    >
      <div className="flex flex-1 flex-col justify-center">
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border bg-background p-4 transition-colors",
          isSignedIn ? "border-foreground" : "border-black/10",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-medium text-foreground">
            {t("tutorial.missions.tools.cardTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {isSignedIn
              ? t("tutorial.missions.tools.cardSignedInBody")
              : t("tutorial.missions.tools.cardBody")}
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : isSignedIn ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            <Check className="size-3" />
            {t("tutorial.missions.tools.signedInPill")}
          </span>
        ) : (
          <AsyncButton
            type="button"
            size="sm"
            className="rounded-full"
            spinner={false}
            onClick={handleSignIn}
          >
            {auth.state.phase === "waiting" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
            {t("tutorial.missions.tools.signIn")}
          </AsyncButton>
        )}
      </div>
      </div>
      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
        onRetry={auth.startAuth}
      />
    </SetupCard>
  );
}
