import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "../../hooks/use-my-profile";
import { PersonFace } from "../mission-person-face";

/**
 * The centrepiece of the Academy: the user's OWN face, wearing the climb.
 *
 * The rank is not a badge printed beside the person, it is drawn AROUND them —
 * the arc closing on their photo is the whole point of the screen, because the
 * thing that is levelling is them, not a statistic.
 *
 * The ring is the app's ONE gauge, code-drawn, scaled up from the composer's
 * context indicator (`components/context-indicator.tsx`): same 32-unit viewBox,
 * same quarter-turn so the arc opens at 12 o'clock, same faint full-circle
 * track under it. Nothing is downloaded and nothing is an image, so it holds in
 * both themes and at any size — the arc is `action`, the track is muted ink.
 *
 * The face is the app's ONE self-identity (`useMyProfile`), the same resolution
 * the Settings header reads, drawn by the same {@link PersonFace} the mission
 * surfaces use, so a user's photo (or their initials, in their own opaque
 * person tone) is identical wherever Houston shows them to themselves. A
 * deployment with no identity backend has no face to show, so it falls back to
 * the glyph the rail already uses for the person rather than inventing a
 * second faceless treatment.
 */

/**
 * viewBox units. `RING_RADIUS + RING_STROKE / 2` must clear 16 or the arc
 * clips against the box; 14 + 1.5 leaves half a unit of air.
 */
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
