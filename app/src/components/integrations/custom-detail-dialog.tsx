import {
  Badge,
  Button,
  CatalogDetailDialog,
  cn,
  StatusBadge,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { KeyRound, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./app-logo";
import { customIntegrationLogoUrl } from "./curated-logos";
import {
  customAuthMethod,
  customKindBadgeKey,
} from "./custom-integrations-model";

function MetaRow({
  label,
  value,
  scroll = false,
}: {
  label: string;
  value: string;
  /** Long unbreakable values (the URL): a quiet horizontal scroll area whose
   *  scrollbar only exists when the text actually overflows, instead of the
   *  ellipsis cut (the address is the one field worth reading in full). */
  scroll?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 text-ink",
          scroll ? "overflow-x-auto whitespace-nowrap" : "truncate",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The custom integration's "more info" modal (HOU-980) — what a custom row or
 * Installed-strip tile opens: letter avatar + name, kind + live-status chips,
 * a situation line, and the metadata the user gave it (URL, added date, the
 * action COUNT — the per-action list was cut on review: raw tool names +
 * model-facing blurbs read as noise to the non-technical audience). Footer:
 * Enter/Update key (when the integration can take one) beside Remove.
 * Presentational: the parent owns the key dialog, the delete confirm, and
 * the selection state.
 */
export function CustomDetailDialog({
  integration,
  onClose,
  onEnterKey,
  onSignIn,
  onRemove,
}: {
  integration: CustomIntegrationView | null;
  onClose: () => void;
  onEnterKey: (integration: CustomIntegrationView) => void;
  /** OAuth integration (PRODUCT-1172): open the browser sign-in — the
   *  pending CTA, and the re-auth affordance once active. */
  onSignIn: (integration: CustomIntegrationView) => void;
  onRemove: (integration: CustomIntegrationView) => void;
}) {
  const { t, i18n } = useTranslation("integrations");
  if (!integration) return null;

  const state = integration.state;
  const oauth = integration.auth === "oauth";
  const body =
    state.status === "active"
      ? t("custom.details.activeBody")
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
        <div className="flex w-full items-center justify-end gap-2">
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
      {/* min-w-0: DialogContent is a GRID, and a grid item's default
          min-width:auto lets one unbreakable URL widen the implicit track
          past the card — spilling the text AND shoving the footer's
          justify-end buttons outside the dialog. */}
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
