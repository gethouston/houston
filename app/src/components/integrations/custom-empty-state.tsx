import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The Custom integrations tab with nothing in it yet: no controls, no list —
 * just the explanation and the one CTA. Filled button, deliberately: in an
 * empty state the CTA IS the surface's single accent (unlike the populated
 * tab, where a filled pill would outweigh the content beside it).
 */
export function CustomEmptyState({
  onAdd,
  pending,
}: {
  onAdd: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyTitle className="text-lg">{t("custom.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("custom.description")}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" disabled={pending} onClick={onAdd}>
        <Plus className="size-4" />
        {t("custom.addButton")}
      </Button>
    </Empty>
  );
}

/**
 * The custom list FAILED to load (a real error, not the feature-absent 404
 * degrade): say so and offer a retry — a transient 500 must never silently
 * erase the whole custom surface (beta no-silent-failures policy).
 */
export function CustomLoadErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("integrations");
  return (
    <section className="flex flex-col items-start gap-2 py-4">
      <p className="text-sm text-ink-muted">{t("custom.loadError")}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t("custom.retry")}
      </Button>
    </section>
  );
}
