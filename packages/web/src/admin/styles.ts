import type { CSSProperties } from "react";

/**
 * Dashboard palette: the Houston `--ht-*` tokens, reached as `var()` because
 * these are inline styles rather than Tailwind utilities. The dashboard root
 * pins `data-theme="dark"` (see dashboard.tsx and sign-in.tsx), so these always
 * resolve to the dark ladder whatever theme the app is in.
 *
 * Text is exactly TWO steps, both solid: `text` for content an operator reads
 * (numbers, pod lines, button labels) and `muted` for the labels and captions
 * around it. There is no third step, because the only thinner tone available
 * would be an alpha wash of the ink, and alpha text over these panels stops
 * being readable at the 11px the table labels run at.
 */
export const C = {
  bg: "var(--ht-base)",
  panel: "var(--ht-card-solid)",
  panel2: "var(--ht-input)",
  /** A control's resting fill — a step above the panel it sits on. */
  field: "var(--ht-field)",
  border: "var(--ht-line)",
  text: "var(--ht-ink)",
  muted: "var(--ht-ink-muted)",
  /** The filled-CTA fill; its label is `--ht-action-text`, never a raw white. */
  accent: "var(--ht-action)",
  green: "var(--ht-success-ink)",
  amber: "var(--ht-warning-ink)",
  red: "var(--ht-danger-ink)",
  blue: "var(--ht-link)",
} as const;

/**
 * A translucent wash of a palette colour. Hex-alpha concatenation cannot apply
 * to a `var()` reference, so the alpha is composited in the colour space
 * instead.
 */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export const page: CSSProperties = {
  minHeight: "100dvh",
  background: C.bg,
  color: C.text,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  padding: "24px 28px 64px",
};

export const card: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 18,
};

export const btn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.accent,
  color: "var(--ht-action-text)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

export const ghostBtn: CSSProperties = {
  ...btn,
  background: "transparent",
  color: C.text,
};

/**
 * A secondary action sitting ON a panel: the control fill, so it reads as a
 * button against the panel rather than a hairline drawn on it, with the ink
 * label the CTA's `action-text` would invert to nothing on.
 */
export const secondaryBtn: CSSProperties = {
  ...btn,
  background: C.field,
  color: C.text,
};

export const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: C.muted,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  padding: "9px 10px",
  fontSize: 13,
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "middle",
};

/** Status pill colors per agent state. */
export const stateColor: Record<string, string> = {
  running: C.green,
  pending: C.amber,
  asleep: C.blue,
  absent: C.muted,
};

export function pill(color: string): CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color,
    background: tint(color, 12),
    border: `1px solid ${tint(color, 33)}`,
  };
}
