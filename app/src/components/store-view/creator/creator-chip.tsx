import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  VerifiedBadge,
} from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";

/** The credited-creator shape carried on every catalog listing. */
type StoreCreator = StoreCatalogAgent["creator"];

/**
 * The compact creator identity chip: a small avatar, the `@handle` (falling back
 * to the display name on unclaimed/legacy listings), and the verified badge. When
 * the creator has a handle AND an `onOpen` is supplied it renders as a button that
 * opens their public profile pane; otherwise it is a non-interactive label (there
 * is no profile to open without a handle). The avatar image is served by Houston's
 * own gateway, and {@link AvatarImage} falls back to the initial if it fails.
 */
export function CreatorChip({
  creator,
  onOpen,
}: {
  creator: StoreCreator;
  onOpen?: (handle: string) => void;
}) {
  const { t } = useTranslation("store");
  const handle = creator.handle;
  const initial = [...creator.displayName.trim()][0]?.toUpperCase() ?? "?";

  const content = (
    <>
      <Avatar size="sm" className="size-5">
        {creator.avatarUrl ? (
          <AvatarImage src={creator.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-ink-muted">
        {handle ? `@${handle}` : creator.displayName}
      </span>
      {creator.verified ? (
        <VerifiedBadge size="sm" label={t("creator.verified")} />
      ) : null}
    </>
  );

  if (!handle || !onOpen) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[13px]">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(handle)}
      title={t("creator.viewProfile")}
      className="inline-flex min-w-0 items-center gap-1 rounded-full text-[13px] transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
    >
      {content}
    </button>
  );
}
