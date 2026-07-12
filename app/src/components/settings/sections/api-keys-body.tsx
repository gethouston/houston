import {
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from "@houston-ai/core";
import type { ApiKey } from "@houston-ai/engine-client";
import { KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useApiKeys,
  useRevokeApiKey,
} from "../../../hooks/queries/use-api-keys";
import { lastUsedState } from "../../../lib/api-keys-model";
import { formatRelativeTime } from "../../organization/org-time";
import { ApiKeyCreateDialog } from "./api-key-create-dialog";

/** The list + create/revoke surface of Settings > API keys. */
export function ApiKeysBody() {
  const { t, i18n } = useTranslation("settings");
  const { data: keys, isLoading, isError, refetch } = useApiKeys();
  const revoke = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  const hasKeys = (keys?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert className="size-6 text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("apiKeys.error.title")}</EmptyTitle>
            <EmptyDescription>
              {t("apiKeys.error.description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("apiKeys.error.retry")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : hasKeys ? (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {keys?.map((key) => (
              <ApiKeyRow
                key={key.id}
                apiKey={key}
                locale={i18n.language}
                onRevoke={() => setRevokeTarget(key)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t("apiKeys.createButton")}
          </Button>
        </>
      ) : (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound className="size-6" />
            </EmptyMedia>
            <EmptyTitle>{t("apiKeys.empty.title")}</EmptyTitle>
            <EmptyDescription>
              {t("apiKeys.empty.description")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("apiKeys.createButton")}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <ApiKeyCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        variant="destructive"
        title={t("apiKeys.revoke.title")}
        description={t("apiKeys.revoke.description", {
          name: revokeTarget?.name ?? "",
        })}
        confirmLabel={t("apiKeys.revoke.confirm")}
        cancelLabel={t("apiKeys.revoke.cancel")}
        onConfirm={() => {
          if (revokeTarget) revoke.mutate(revokeTarget.id);
          setRevokeTarget(null);
        }}
      />
    </div>
  );
}

interface ApiKeyRowProps {
  apiKey: ApiKey;
  locale: string;
  onRevoke: () => void;
}

function ApiKeyRow({ apiKey, locale, onRevoke }: ApiKeyRowProps) {
  const { t } = useTranslation("settings");
  const created = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(apiKey.createdAt));
  const used = lastUsedState(apiKey);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {apiKey.name}
          </span>
          <code className="shrink-0 font-mono text-xs text-muted-foreground">
            {apiKey.prefix}
          </code>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("apiKeys.row.created", { date: created })}</span>
          {used.kind === "never" ? (
            <Badge variant="secondary">{t("apiKeys.row.neverUsed")}</Badge>
          ) : (
            <span>
              {t("apiKeys.row.lastUsed", {
                when: formatRelativeTime(used.atMs, locale),
              })}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-destructive hover:text-destructive"
        onClick={onRevoke}
      >
        {t("apiKeys.row.revoke")}
      </Button>
    </div>
  );
}
