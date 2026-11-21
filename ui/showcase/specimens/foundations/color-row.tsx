import { cn } from "@houston-ai/core";
import { storeType } from "@houston-ai/store";

import type { ColorToken } from "./color-tokens";

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

export function ColorRow({
  token,
  value,
}: {
  token: ColorToken;
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
          {value === undefined || value === "" ? "—" : value}
        </code>
      </div>
    </div>
  );
}
