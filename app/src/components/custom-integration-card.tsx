import { Button, Input } from "@houston-ai/core";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/ui";
import {
  type CustomProposal,
  canSubmitKey,
  deriveCustomCardView,
  hostnameFromBaseUrl,
} from "./custom-integration-card-state";
import { CustomBadge } from "./integrations";
import { useCustomIntegrationFlow } from "./integrations/use-custom-integration-flow";
import { ProposalLogo } from "./proposal-logo";

interface CustomIntegrationCardProps {
  /** The agent-authored proposal (name, base URL, auth scheme, description). */
  proposal: CustomProposal;
  /** Why the agent wants this service, in its own words (optional). */
  reason?: string;
  /** The agent whose chat hosts the card — the new integration is granted to it. */
  agentId: string;
  /** Multiplayer: auto-grant the fresh integration to this agent (C4). */
  autoGrant: boolean;
  /**
   * Fired once after the integration is created AND granted. The chat panel
   * nudges the agent ("I've connected X. Please continue.") so the task resumes
   * without the user having to retype.
   */
  onAdded: (name: string) => void;
  /** Fired when the user picks "Not now" — the panel hides the card. */
  onDismiss: () => void;
}

/**
 * The secure setup card the chat renders IN PLACE OF the composer when the agent
 * proposes a service the app catalog can't offer (`propose_custom_integration`
 * → PendingInteraction `custom_integration`). The user pastes their API key
 * here; on Add, Houston creates the integration, grants it to the agent, and
 * nudges the agent to continue.
 *
 * The key is a password input held ONLY in local state and passed straight to
 * the create call — it is cleared the instant the create resolves and never
 * touches chat state, the nudge message, a toast, or any log. The pure logic
 * (hostname, key gate, view, dedupe) lives in `custom-integration-card-state`.
 */
export function CustomIntegrationCard({
  proposal,
  reason,
  agentId,
  autoGrant,
  onAdded,
  onDismiss,
}: CustomIntegrationCardProps) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  const flow = useCustomIntegrationFlow({ agentId, autoGrant });
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [done, setDone] = useState(false);

  const host = hostnameFromBaseUrl(proposal.baseUrl);
  const view = deriveCustomCardView(flow.submitting, done);
  const canAdd = view === "idle" && canSubmitKey(apiKey);

  const add = async () => {
    if (!canAdd) return;
    try {
      await flow.create({ ok: true, config: proposal, apiKey });
      // Drop the secret from state the moment the create resolves — it is never
      // needed again and must not linger past the one call that consumes it.
      setApiKey("");
      setDone(true);
      addToast({
        title: t("custom.card.added", { name: proposal.name }),
        variant: "success",
      });
      onAdded(proposal.name);
    } catch {
      // call() already surfaced + reported the reason; keep the card open with
      // the typed key intact so the user can retry.
    }
  };

  return (
    <div className="rounded-[22px] border border-border/50 bg-card p-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <ProposalLogo name={proposal.name} url={proposal.baseUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {proposal.name}
            </span>
            <CustomBadge className="shrink-0" />
          </div>
          <span className="block truncate text-xs text-muted-foreground">
            {host}
          </span>
        </div>
      </div>

      {reason ? (
        <p className="mt-3 text-[13px] text-foreground/80">{reason}</p>
      ) : null}

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("custom.card.apiKeyPlaceholder")}
            aria-label={t("custom.card.apiKey")}
            className="pr-10 font-mono"
            disabled={view !== "idle"}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? t("custom.card.hide") : t("custom.card.show")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showKey ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>

        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          {t("custom.card.securityNote")}
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onDismiss}
            disabled={view !== "idle"}
          >
            {t("custom.card.notNow")}
          </Button>
          <Button type="submit" disabled={!canAdd}>
            {view === "submitting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("custom.card.add")
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
