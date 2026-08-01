/**
 * The Agent Store design language, encoded once.
 *
 * Every store component composes its classes from here instead of spelling
 * Tailwind by hand, so the language stays consistent across the two consumers
 * (the Next.js site in `agentstore/` and the Vite app in `app/`) and a change
 * to the direction is a change to ONE file.
 *
 * Rules baked in (see `ui/store/DESIGN.md` for the rationale):
 *   - semantic `--ht-*` tokens only, never a raw colour;
 *   - air over density: 1040px measure, 24/32px gutters, 40/64px rhythm;
 *   - flat surfaces, no shadows, no lift on hover;
 *   - motion touches colour and border only.
 */

/** Page geometry: the measure, the gutters and the vertical rhythm. */
export const storeLayout = {
  /**
   * The store's page plane. TRANSPARENT on purpose: in the app the shell's
   * `.canvas-screen` (the SCREEN surface) is behind the store, and the store
   * website provides the same screen plane in its layout — StorePage just
   * fills whatever screen it is given (user decision 2026-07-29: the store is
   * designed against `bg-background`, never the gutter). `min-h-full` (not
   * `min-h-screen`) so the same frame works as a whole document in
   * `agentstore/` and as a pane inside the app shell; the consumer owns the
   * height of the box we fill.
   */
  page: "min-h-full w-full text-ink",
  /** Centred 1040px measure with the 24px / 32px horizontal gutters. */
  container: "mx-auto w-full max-w-[1040px] px-6 md:px-8",
  /** 48px of air above the first thing on the page, 64px of run-out below. */
  pagePadding: "pt-12 pb-16",
  /**
   * The rhythm between a page's blocks: 40px mobile, 64px desktop. A flex gap
   * rather than section margins, so blocks never collapse into each other and
   * a section stays margin-free (composable under any parent).
   */
  stack: "flex flex-col gap-10 md:gap-16",
  /** Gap between a section's head and its body. */
  sectionStack: "flex flex-col gap-6",
} as const;

/** The four type roles. Nothing in the store is typed outside this scale. */
export const storeType = {
  /** 32px/1.2 semibold — one per page, the page title. */
  display:
    "text-[32px] leading-[1.2] font-semibold tracking-tight text-ink text-balance",
  /** 20px/1.3 semibold — a section's title. */
  sectionTitle:
    "text-xl leading-[1.3] font-semibold tracking-tight text-ink text-balance",
  /** 15px/1.55 — running copy. */
  body: "text-[15px] leading-[1.55] text-ink",
  /** 13px/1.4 muted — subtitles, captions, counts. */
  meta: "text-[13px] leading-[1.4] text-ink-muted",
} as const;

/** 150ms, colour and border only. Never transform, never `transition-all`. */
export const storeMotion = "transition-colors duration-150 ease-out";

/** Flat surfaces. No shadows in either theme; depth comes from the hairline. */
export const storeSurface = {
  /** The resting card: 24px padding, 1px hairline, 16px radius, no shadow. */
  card: "rounded-2xl border border-line bg-card p-6",
  /** A card that responds to the pointer: background + border shift, no lift. */
  cardInteractive: `rounded-2xl border border-line bg-card p-6 ${storeMotion} hover:border-line-input hover:bg-card-hover focus-visible:border-focus focus-visible:outline-none`,
  /** A recessed panel below the card tier (rails, empty states, code blocks). */
  panel: "rounded-2xl border border-line bg-chip-subtle p-6",
  /**
   * Soft badge. Neutral by default — colour here would be decorative. `w-fit`
   * so it hugs its label even as a stretched child of a flex column.
   */
  chip: "inline-flex w-fit items-center gap-1.5 rounded-full bg-chip px-3 py-1 text-[13px] leading-[1.4] text-chip-text",
  /** The accent. At most ONE of these is visible per view. */
  ctaPrimary: `inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text ${storeMotion} hover:bg-action/85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50`,
  /** Every other action on the page. */
  ctaSecondary: `inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium text-ink ${storeMotion} hover:border-line-input hover:bg-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50`,
} as const;

/** Collection density: a card grid, and a stacked list of rows. */
export const storeDensity = {
  /** 24px gutters between cards. */
  grid: "grid gap-6",
  /** 16px between list rows. */
  list: "flex flex-col gap-4",
} as const;
