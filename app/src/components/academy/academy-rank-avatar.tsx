import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../hooks/use-my-profile";
import { PersonFace } from "../mission-person-face";

const RING_RADIUS = 14;
const RING_STROKE = 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function AcademyRankAvatar({ percent }: { percent: number }) {
  const { t } = useTranslation("academy");
  const profile = useMyProfile();
  const pct = Math.min(100, Math.max(0, percent));

  return (
    <span
      role="img"
      aria-label={t("status.avatarAlt")}
      className="relative flex size-16 shrink-0 items-center justify-center"
    >
      <svg
        viewBox="0 0 32 32"
        className="absolute inset-0 size-16 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-ink-muted/25"
        />
        {pct > 0 && (
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            className="stroke-action"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - pct / 100)}
          />
        )}
      </svg>
      {profile ? (
        <PersonFace
          person={{
            id: profile.userId,
            label: profile.name,
            imageUrl: profile.avatarUrl ?? undefined,
          }}
          className="size-12"
          initialsClassName="text-base font-medium"
        />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-chip">
          <UserRound className="size-6 text-ink-muted" aria-hidden />
        </span>
      )}
    </span>
  );
}
