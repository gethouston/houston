/** Page geometry: the measure, the gutters and the vertical rhythm. */
export const storeLayout = {
  page: "min-h-full w-full text-ink",
  container: "mx-auto w-full max-w-[1040px] px-6 md:px-8",
  pagePadding: "pt-12 pb-16",
  stack: "flex flex-col gap-10 md:gap-16",
  sectionStack: "flex flex-col gap-6",
} as const;

/** The four type roles. Nothing in the store is typed outside this scale. */
export const storeType = {
  display:
    "text-[32px] leading-[1.2] font-semibold tracking-tight text-ink text-balance",
  sectionTitle:
    "text-xl leading-[1.3] font-semibold tracking-tight text-ink text-balance",
  body: "text-[15px] leading-[1.55] text-ink",
  meta: "text-[13px] leading-[1.4] text-ink-muted",
} as const;

/** 150ms, colour and border only. Never transform, never `transition-all`. */
export const storeMotion = "transition-colors duration-150 ease-out";

/** Flat surfaces. No shadows in either theme; depth comes from the hairline. */
export const storeSurface = {
  card: "rounded-2xl border border-line bg-card p-6",
  cardInteractive: `rounded-2xl border border-line bg-card p-6 ${storeMotion} hover:border-line-input hover:bg-card-hover focus-visible:border-focus focus-visible:outline-none`,
  panel: "rounded-2xl border border-line bg-chip-subtle p-6",
  chip: "inline-flex w-fit items-center gap-1.5 rounded-full bg-chip px-3 py-1 text-[13px] leading-[1.4] text-chip-text",
  ctaPrimary: `inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-text ${storeMotion} hover:bg-action/85 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50`,
  ctaSecondary: `inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium text-ink ${storeMotion} hover:border-line-input hover:bg-card-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50`,
} as const;

/** Collection density: a card grid, and a stacked list of rows. */
export const storeDensity = {
  grid: "grid gap-6",
  list: "flex flex-col gap-4",
} as const;
