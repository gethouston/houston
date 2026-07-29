import {
  Badge,
  Button,
  CatalogDetailDialog,
  Skeleton,
  StatusBadge,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomIntegrationTools } from "../../hooks/queries";
import { AppLogo } from "./app-logo";
import {
  customAuthMethod,
  customKindBadgeKey,
} from "./custom-integrations-model";

/** How many actions the dialog lists before collapsing behind a count line —
 *  a 200-endpoint API must not turn the modal into a scroll marathon. */
const TOOLS_PREVIEW_CAP = 8;

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The custom integration's "more info" modal (HOU-980) — what a custom row or
 * Installed-strip tile opens: letter avatar + name, kind + live-status chips,
 * a situation line, the metadata the user gave it (URL, added date), and the
 * compiled actions behind it (count + names, capped). Footer: Enter/Update key
 * (when the integration can take one) beside Remove. Presentational: the
 * parent owns the key dialog, the delete confirm, and the selection state.
 */
export function CustomDetailDialog({
  integration,
  agentId,
  onClose,
  onEnterKey,
  onRemove,
}: {
  integration: CustomIntegrationView | null;
  /** Per-agent surface (HOU-823): the tools read rides the agent's routes. */
  agentId?: string;
  onClose: () => void;
  onEnterKey: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
}) {
  const { t, i18n } = useTranslation("integrations");
  const activeSlug =
    integration && integration.state.status === "active"
      ? integration.slug
      : null;
  const tools = useCustomIntegrationTools(activeSlug, agentId);
  if (!integration) return null;
  const active = activeSlug !== null;

  const state = integration.state;
  const body =
    state.status === "active"
      ? t("custom.details.activeBody")
      : state.status === "pending"
        ? t("custom.details.pendingBody")
        : t("custom.details.errorBody", { message: state.message });
  const canTakeKey = customAuthMethod(integration) !== null;
  const shownTools = (tools.data ?? []).slice(0, TOOLS_PREVIEW_CAP);
  const hiddenCount = (tools.data?.length ?? 0) - shownTools.length;

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
            logoUrl: "",
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
                ? t("custom.status.pendingKey")
                : t(`status.${state.status}`)
            }
          />
        </>
      }
      description={body}
      action={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onRemove(integration)}
            className="text-danger hover:bg-danger/10 hover:text-danger"
          >
            {t("custom.delete.confirm")}
          </Button>
          {canTakeKey && (
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
          )}
        </div>
      }
    >
      <dl className="space-y-1.5">
        {integration.displayUrl && (
          <MetaRow
            label={t("custom.details.url")}
            value={integration.displayUrl}
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

      {active && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink">
            {t("custom.details.toolsTitle")}
          </p>
          {tools.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : tools.data == null ? null : tools.data.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              {t("custom.details.toolsEmpty")}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {shownTools.map((tool) => (
                <li key={tool.name} className="text-[13px]">
                  <span className="text-ink">{tool.name}</span>
                  {tool.description && (
                    <span className="text-ink-muted">
                      {" "}
                      · {tool.description}
                    </span>
                  )}
                </li>
              ))}
              {hiddenCount > 0 && (
                <li className="text-[13px] text-ink-muted">
                  {t("custom.details.moreTools", { count: hiddenCount })}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </CatalogDetailDialog>
  );
}
