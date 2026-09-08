import { useTranslation } from "react-i18next";

/**
 * The assistant's opening beat: what it is, what it can reach, and the promise
 * that keeps a "can do anything" agent trustworthy — it asks first.
 *
 * Three short lines and no cards: a 1-on-1 chat opens on the composer, so the
 * empty state introduces the person on the other side rather than handing the
 * user a menu of things to click.
 */
export function AssistantEmptyState() {
  const { t } = useTranslation("assistant");
  return (
    <div className="w-full self-stretch overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pt-6 pb-4 text-center md:pt-10">
        <h3 className="text-balance text-base font-medium text-ink">
          {t("empty.heading")}
        </h3>
        <p className="text-balance text-sm text-ink-muted">
          {t("empty.capabilities")}
        </p>
        <p className="text-balance text-sm text-ink-muted">
          {t("empty.safety")}
        </p>
      </div>
    </div>
  );
}
