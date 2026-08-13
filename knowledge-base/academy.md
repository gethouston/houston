# Houston Academy

The gamified learn-Houston surface: a top-level `academy` view under About me
(GraduationCap row in the sidebar's primary run), a rank + experience header
built around the user's own face, and a chapter path where the in-app setup is
the first chapter. Built to absorb a curriculum: chapters/lessons are data, the
engine ships dormant until content lands.

## The view

- `app/src/components/academy/` — `academy-view.tsx` (PageHeader strip family,
  like Skills/Store), `academy-status-header.tsx` (PersonFace in an SVG progress
  ring + the house meter bar + usage/streak SpecChips), `academy-path.tsx`
  (chapter nodes; Start/Replay runs `useRunGuidedSetup`, the same arming the
  rail footer's "Guide me" uses). Registered at the four standard sites
  (`top-level-views.ts`, `top-level-screen-views.tsx`, `sidebar-nav-sections.tsx`,
  guard tests); ungated, never blocked, like About me.
- The header surfaces `isError` from the progress hook: an unreadable engine
  with an empty mirror renders a retry state, never Cadet/0 (which would offer
  "Start" on a finished chapter).

## Setup is Chapter 1

- The in-app setup's finale is the `academyReveal` narration card; its CTA runs
  `finish()` and lands on the Academy. `finish()` awards the `setup` chapter
  (50 experience) idempotently for first-run AND replay, so replays never
  double-pay. Award lives in `use-setup-chapter-award.ts`.

## Progress record (the economy)

- One versioned JSON record per account: engine preference
  `houston_academy_progress` (source of truth; on hosted cloud it lives on the
  user's pod and follows them) + a uid-keyed localStorage mirror (device cache,
  never authoritative). Pure modules in `app/src/lib/academy/`.
- Merge only grows: chapter/lesson union, per-device usage max, later day wins;
  a stale device can never downgrade progress.
- **Every mutation flows through the per-uid serialized queue in
  `academy-mutations.ts`** (chapter award, lesson award, usage accrual) with a
  re-merge against a fresh load before commit. Engine writes are identity-pinned:
  a write whose captured uid no longer matches the active session is dropped
  (the uid-keyed mirror keeps it for that account's next boot). Never write the
  record directly.
- Usage points: `subscribeAnalytics` (fires with or without a PostHog key) pays
  a closed event→points map, capped at 20/day, into device-keyed counters. The
  device key is a device-local localStorage id (`usage-device.ts`) because
  `install_id` lives in the engine's account-level store and is shared by all of
  a hosted account's devices. Pending points flush synchronously on
  `onAppHidden` (`lib/app-hidden.ts`) — React cleanup never runs on quit.
- Streak is usage-only (`liveStreak` reads current as 0 unless active
  today/yesterday). Ranks: `academy-ranks.ts` — cadet → mission director,
  top ranks usage-gated; thresholds rise as chapters ship; a reached rank is
  never revoked.

## Lesson engine (dormant)

- Declarative `LessonSpec` (`lib/academy/lesson-spec.ts`): video beat
  (`LessonVideoCard`, asset manifest `lib/academy/videos.ts` — publishing a
  video is one manifest row), narration beats, and click-through spotlight
  beats that advance on real signals (`lib/academy/lesson-signals.ts`:
  viewReached / hostEvent / conversationCreated).
- Runner: `components/academy/lessons/` — whisper spotlight (one sentence +
  step count + X), docked video/note panels, Escape exits (trusted events
  only). A conversationCreated beat does not arm its click target until the
  settled baseline is captured (`useSettledConversations`, which withholds its
  count until the agent roster is `loaded` — the boot gap must not read as
  zero). Entry point is `setActiveLessonId`; nothing calls it until curriculum
  content ships. Lesson copy convention:
  `academy:lessons.<lessonId>.steps.<stepId>.*`; lesson ids are guarded against
  the reserved chrome keys by the registry test.

## Tutorial family

- `components/tutorial/` (spotlight + veil, center card, video card, dismiss
  button) is content-agnostic and shared by the mandatory setup and lessons.
  Dismissal renders only when `onDismiss` is passed; the setup passes none and
  stays escape-free.

## Analytics

- `academy_opened`, `academy_chapter_completed`, `academy_lesson_started`,
  `academy_lesson_completed` in the closed union; usage accrual skips
  `academy_*` events so the Academy cannot farm itself.
