import type { CustomIntegrationView } from "@houston/engine-adapter";
import {
  Badge,
  Button,
  CatalogDetailDialog,
  StatusBadge,
} from "@houston-ai/core";
import { KeyRound, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationScope } from "../../hooks/queries";
import { AppLogo } from "./app-logo";
import { customIntegrationLogoUrl } from "./curated-logos";
import {
  customAuthMethod,
  customKindBadgeKey,
} from "./custom-integrations-model";
import { MetaRow } from "./custom-meta-row";

export function CustomDetailDialog({
  integration,
  onClose,
  onEnterKey,
  onSignIn,
  onRemove,
  onEdit,
}: {
  integration: CustomIntegrationView | null;
  onClose: () => void;
  onEnterKey: (integration: CustomIntegrationView) => void;
  onSignIn: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
  onEdit: (integration: CustomIntegrationView) => void;
}) {
  const { t, i18n } = useTranslation("integrations");
  const scope = useCustomIntegrationScope();
  if (!integration) return null;

  const state = integration.state;
  const oauth = integration.auth === "oauth";
  const body =
    state.status === "active"
      ? t(
          scope === "agent"
            ? "custom.details.activeBodyAgent"
            : "custom.details.activeBody",
        )
      : state.status === "pending"
        ? t(
            oauth
              ? "custom.details.pendingSignInBody"
              : "custom.details.pendingBody",
          )
        : t("custom.details.errorBody", { message: state.message });
  const canTakeKey = customAuthMethod(integration) !== null;

  return (
    <CatalogDetailDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      icon={
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
          size="xl"
          className="rounded-xl"
        />
      }
      title={integration.name}
      tags={
        <>
          <Badge variant="secondary">
            {t(customKindBadgeKey(integration.kind))}
          </Badge>
          <StatusBadge
            status={state.status}
            label={
              state.status === "pending"
                ? t(
                    oauth
                      ? "custom.status.pendingSignIn"
                      : "custom.status.pendingKey",
                  )
                : t(`status.${state.status}`)
            }
          />
        </>
      }
      description={body}
      action={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onEdit(integration)}
          >
            {t("custom.edit.title")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onRemove(integration)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            {t("custom.delete.confirm")}
          </Button>
          {oauth ? (
            <Button
              type="button"
              variant={state.status === "pending" ? "default" : "outline"}
              onClick={() => onSignIn(integration)}
              className="gap-1.5"
            >
              <LogIn className="size-4" />
              {state.status === "pending"
                ? t("custom.signIn")
                : t("custom.signInAgain")}
            </Button>
          ) : (
            canTakeKey && (
              <Button
                type="button"
                variant={state.status === "pending" ? "default" : "outline"}
                onClick={() => onEnterKey(integration)}
                className="gap-1.5"
              >
                <KeyRound className="size-4" />
                {state.status === "pending"
                  ? t("custom.enterKey")
                  : t("custom.details.updateKey")}
              </Button>
            )
          )}
        </div>
      }
    >
      <dl className="min-w-0 space-y-1.5">
        {integration.displayUrl && (
          <MetaRow
            label={t("custom.details.url")}
            value={integration.displayUrl}
            scroll
          />
        )}
        <MetaRow
          label={t("custom.details.added")}
          value={new Intl.DateTimeFormat(i18n.language, {
            dateStyle: "medium",
          }).format(new Date(integration.addedAtMs))}
        />
        {state.status === "active" && (
          <MetaRow
            label={t("custom.details.actions")}
            value={t("custom.toolCount", { count: state.toolCount })}
          />
        )}
      </dl>
    </CatalogDetailDialog>
  );
}
