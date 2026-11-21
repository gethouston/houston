import type { CustomIntegrationView } from "@houston/engine-adapter";
import { Button, StatusDot } from "@houston-ai/core";
import { KeyRound, LogIn, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./app-logo";
import { customIntegrationLogoUrl } from "./curated-logos";
import { customKindBadgeKey } from "./custom-integrations-model";

interface CustomIntegrationRowProps {
  integration: CustomIntegrationView;
  onOpen: (integration: CustomIntegrationView) => void;
  onEnterKey: (integration: CustomIntegrationView) => void;
  onSignIn: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
}

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
