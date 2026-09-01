import { Button, StatusDot } from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { KeyRound, LogIn, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./app-logo";
import { customIntegrationLogoUrl } from "./curated-logos";
import { customKindBadgeKey } from "./custom-integrations-model";

interface CustomIntegrationRowProps {
  integration: CustomIntegrationView;
  /** Row-body click: open the integration's detail card (HOU-980). */
  onOpen: (integration: CustomIntegrationView) => void;
  onEnterKey: (integration: CustomIntegrationView) => void;
  /** Pending OAuth integration (PRODUCT-1172): open the browser sign-in. */
  onSignIn: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
}

/** The status line under the name: "Connected" (active — the action COUNT is
 *  deliberately not shown here: discovery isn't deterministic enough yet for
 *  a number to read as a promise; the detail card still shows it), a
 *  needs-key prompt (pending), or the error message (error, tinted). Spans
 *  (not <p>) because the line renders inside the row-body <button>, phrasing
 *  content only. */
function StatusLine({ integration }: { integration: CustomIntegrationView }) {
  const { t } = useTranslation("integrations");
  const state = integration.state;
  if (state.status === "active")
    return (
      <span className="block text-[11px] text-ink-muted">
        {t("custom.status.active")}
      </span>
    );
  if (state.status === "pending")
    return (
      <span className="block text-[11px] text-ink-muted">
        {t(
          integration.auth === "oauth"
            ? "custom.status.pendingSignIn"
            : "custom.status.pendingKey",
        )}
      </span>
    );
  return (
    <span
      className="block truncate text-[11px] text-danger"
      title={state.message}
    >
      {t("custom.status.error", { message: state.message })}
    </span>
  );
}

/**
 * One custom integration on the Integrations page, in the flat "plane" row
 * language shared with the category catalog: a leading letter avatar for visual
 * rhythm, name + a connection-type badge ("API" / "MCP server") on the top line,
 * a status line under it, and always-visible trailing actions — an "Enter key"
 * button while it waits on a secret, plus a Remove button (no hover gating). The
 * row BODY is the open affordance (the same grammar as the catalog rows: click
 * for the detail card); the trailing buttons stay separate targets. The row is
 * transparent at rest with a full-row hover fill, no bordered card or chip.
 * Presentational; the parent owns the dialogs.
 */
export function CustomIntegrationRow({
  integration,
  onOpen,
  onEnterKey,
  onSignIn,
  onRemove,
}: CustomIntegrationRowProps) {
  const { t } = useTranslation("integrations");
  const pending = integration.state.status === "pending";
  const oauth = integration.auth === "oauth";

  return (
    <div className="flex items-center gap-1.5 rounded-2xl px-3 py-3 transition-colors hover:bg-hover">
      <button
        type="button"
        onClick={() => onOpen(integration)}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <AppLogo
          display={{
            toolkit: integration.slug,
            name: integration.name,
            description: "",
            logoUrl: customIntegrationLogoUrl(
              integration.slug,
              integration.iconUrl,
            ),
          }}
          size="lg"
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
            {/* The same presence dot the catalog's installed rows wear —
                connected state must read without opening the detail card. No
                srLabel: the status line below already SAYS "Connected", and a
                second (visually hidden) copy doubled the announcement. */}
            {integration.state.status === "active" && (
              <StatusDot status="active" />
            )}
            <span className="min-w-0 truncate">{integration.name}</span>
            <span className="shrink-0 rounded-full bg-chip-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
              {t(customKindBadgeKey(integration.kind))}
            </span>
          </span>
          <StatusLine integration={integration} />
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {pending && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              oauth ? onSignIn(integration) : onEnterKey(integration)
            }
          >
            {oauth ? (
              <LogIn className="size-3.5" />
            ) : (
              <KeyRound className="size-3.5" />
            )}
            {t(oauth ? "custom.signIn" : "custom.enterKey")}
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("custom.delete.confirm")}
          onClick={() => onRemove(integration)}
        >
          <Trash2 className="size-4 text-ink-muted" />
        </Button>
      </div>
    </div>
  );
}
