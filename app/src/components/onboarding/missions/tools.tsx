import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Button, cn } from "@houston-ai/core";
import {
  useConnections,
  useResetConnections,
} from "../../../hooks/queries";
import { useComposioAuth } from "../../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../../composio-auth-dialog";

interface ToolsMissionProps {
  onContinue: () => void;
}

/**
 * M3 Tools — sign the user into Composio (the account-level token) so
 * the assistant can call any toolkit later. Per-toolkit connections are
 * still posted by the agent in M4 as connect cards. Continue is gated
 * on `useConnections().status === "ok"`.
 */
export function ToolsMission({ onContinue }: ToolsMissionProps) {
  const { t } = useTranslation("setup");
  const { data: status, isLoading } = useConnections();
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());
  const isSignedIn = status?.status === "ok";

  const handleSignIn = useCallback(() => {
    void auth.startAuth();
  }, [auth]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div
        className={cn(
          "flex items-center gap-4 rounded-xl border bg-background p-4 transition-colors",
          isSignedIn ? "border-emerald-200" : "border-black/5",
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
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <Check className="size-3" />
            {t("tutorial.missions.tools.signedInPill")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={handleSignIn}
            disabled={auth.state.phase === "waiting"}
          >
            {auth.state.phase === "waiting" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
            {t("tutorial.missions.tools.signIn")}
          </Button>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          className="rounded-full"
          disabled={!isSignedIn}
          onClick={onContinue}
        >
          {t("tutorial.missions.tools.continue")}
        </Button>
      </div>
      {isSignedIn && (
        <p className="text-xs text-muted-foreground">
          {t("tutorial.missions.tools.continueHint")}
        </p>
      )}
      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopenBrowser={auth.reopenBrowser}
      />
    </div>
  );
}
