import { cn } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";

import type { ColorToken } from "./color-tokens";

/**
 * The swatch itself, painted with `var(--ht-*)` over a split field: the left
 * half is the white `input` surface, the right half the `gutter` the window is
 * painted in.
 *
 * Half the palette is translucent glass, and a translucent fill shown over one
 * flat colour is a lie — it looks solid. Two token-coloured halves under it
 * make the alpha visible without introducing a raw colour anywhere.
 */
function Swatch({ variable }: { variable: string }) {
  return (
    <span
      aria-hidden
      className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-input"
    >
      <span className="absolute inset-y-0 right-0 w-1/2 bg-gutter" />
      <span
        className="absolute inset-0"
        style={{ background: `var(${variable})` }}
      />
    </span>
  );
}

/**
 * One token: what it looks like, what it is called, what it is for, the CSS
 * variable to type, and the value it resolves to RIGHT NOW in the theme on
 * screen.
 *
 * A bespoke row rather than `SpecimenRow` — that row is a label rail plus a
 * bag of examples, and this one is a four-column record. It keeps the same
 * hairline-separated rhythm so the page still reads as one document.
 */
export function ColorRow({
  token,
  value,
}: {
  token: ColorToken;
  /** The live resolved value, or nothing until the first read lands. */
  value: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 border-line border-b pb-6 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
      <Swatch variable={token.variable} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn(storeType.body, "font-medium")}>{token.label}</span>
        <span className={storeType.meta}>{token.role}</span>
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:w-56 sm:items-end">
        <code className={cn(storeType.meta, "font-mono")}>
          {token.variable}
        </code>
        <code className={cn(storeType.body, "font-mono tabular-nums")}>
          {/* Never a stale value: the row shows a dash until the document has
              actually been read, so what is on screen is always the truth. */}
          {value === undefined || value === "" ? "—" : value}
        </code>
      </div>
    </div>
  );
}
