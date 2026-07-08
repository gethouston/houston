import { Button, Input } from "@houston-ai/core";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/ui";
import {
  deriveCustomCardView,
  hostnameFromBaseUrl,
} from "./custom-integration-card-state";
import { McpBadge } from "./integrations";
import { useMcpServerFlow } from "./integrations/use-mcp-server-flow";
import {
  canSubmitMcp,
  type McpProposal,
  mcpNeedsSecret,
} from "./mcp-server-card-state";
import { ProposalLogo } from "./proposal-logo";

interface McpServerCardProps {
  /** The agent-authored proposal (name, server URL, auth scheme, description). */
  proposal: McpProposal;
  /** Why the agent wants this server, in its own words (optional). */
  reason?: string;
  /** The agent whose chat hosts the card — the new server is granted to it. */
  agentId: string;
  /** Multiplayer: auto-grant the fresh server to this agent (C4). */
  autoGrant: boolean;
  /**
   * Fired once after the server is connected AND granted. The chat panel nudges
   * the agent ("I've connected X. Please continue.") so the task resumes without
   * the user having to retype.
   */
  onAdded: (name: string) => void;
  /** Fired when the user picks "Not now" — the panel hides the card. */
  onDismiss: () => void;
}

/**
 * The secure setup card the chat renders IN PLACE OF the composer when the agent
 * proposes connecting a remote MCP server (`propose_mcp_server` → an
 * `mcp_server` interaction step). Mirrors `CustomIntegrationCard` end-to-end:
 * the user supplies the bearer token / header value here; on Add, Houston
 * connects the server, grants it to the agent, and nudges the agent to continue.
 *
 * The secret is a password input held ONLY in local state and passed straight to
 * the create call — it is cleared the instant the create resolves and never
 * touches chat state, the nudge message, a toast, or any log. Servers with
 * `auth.type === "none"` collect no secret and Add immediately. The pure logic
 * (host, submit gate, view) lives in `mcp-server-card-state`.
 */
export function McpServerCard({
  proposal,
  reason,
  agentId,
  autoGrant,
  onAdded,
  onDismiss,
}: McpServerCardProps) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  const flow = useMcpServerFlow({ agentId, autoGrant });
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [done, setDone] = useState(false);

  const host = hostnameFromBaseUrl(proposal.url);
  const needsSecret = mcpNeedsSecret(proposal.auth);
  const view = deriveCustomCardView(flow.submitting, done);
  const canAdd = view === "idle" && canSubmitMcp(proposal.auth, secret);

  const add = async () => {
    if (!canAdd) return;
    try {
      await flow.create({
        ok: true,
        config: proposal,
        authValue: needsSecret ? secret : undefined,
      });
      // Drop the secret from state the moment the create resolves — it is never
      // needed again and must not linger past the one call that consumes it.
      setSecret("");
      setDone(true);
      addToast({
        title: t("mcp.card.added", { name: proposal.name }),
        variant: "success",
      });
      onAdded(proposal.name);
    } catch {
      // call() already surfaced + reported the reason; keep the card open with
      // the typed secret intact so the user can retry.
    }
  };

  return (
    <div className="rounded-[22px] border border-border/50 bg-card p-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <ProposalLogo name={proposal.name} url={proposal.url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {proposal.name}
            </span>
            <McpBadge className="shrink-0" />
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
        {needsSecret ? (
          <>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={t("mcp.card.secretPlaceholder")}
                aria-label={t("mcp.card.secret")}
                className="pr-10 font-mono"
                disabled={view !== "idle"}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                aria-label={
                  showSecret ? t("mcp.card.hide") : t("mcp.card.show")
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showSecret ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="mt-px size-3.5 shrink-0" />
              {t("mcp.card.securityNote")}
            </p>
          </>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onDismiss}
            disabled={view !== "idle"}
          >
            {t("mcp.card.notNow")}
          </Button>
          <Button type="submit" disabled={!canAdd}>
            {view === "submitting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("mcp.card.add")
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
