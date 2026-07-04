/**
 * Small shared chips + inline meta for the AI models hub: a base `SpecChip`
 * (grey pill, 12px, muted) and the capability / auth / price / context readouts
 * built on it. Presentational only; every label flows through the `aiHub`
 * namespace so the hub stays translated.
 */

import { Brain, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatPrice, formatTokens } from "./format.ts";

/** The base grey pill every hub chip is built from. */
export function SpecChip({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

/** A labelled spec value, e.g. "Context · 200K". Muted label, plain value. */
export function SpecValueChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <SpecChip>
      <span className="text-muted-foreground/70">{label}</span>
      <span className="text-foreground/80">{value}</span>
    </SpecChip>
  );
}

/** Marks a model that thinks before it answers. */
export function ReasoningBadge() {
  const { t } = useTranslation("aiHub");
  return (
    <SpecChip icon={<Brain className="size-3" />}>
      {t("model.specs.reasoning")}
    </SpecChip>
  );
}

/** Marks a model that can read images. */
export function VisionBadge() {
  const { t } = useTranslation("aiHub");
  return (
    <SpecChip icon={<Eye className="size-3" />}>
      {t("model.specs.vision")}
    </SpecChip>
  );
}

/** A context window as a compact chip, e.g. "200K". */
export function ContextChip({ tokens }: { tokens: number }) {
  return <SpecChip>{formatTokens(tokens)}</SpecChip>;
}

/**
 * Per-1M-token pricing as inline text (used as a `RowCard` description). Renders
 * nothing when neither side has a price so the caller can fall back to a
 * subscription label.
 */
export function PriceText({
  input,
  output,
}: {
  input?: number;
  output?: number;
}) {
  const { t } = useTranslation("aiHub");
  if (input == null && output == null) return null;
  return (
    <>
      {t("model.offers.pricing", {
        input: formatPrice(input),
        output: formatPrice(output),
      })}
    </>
  );
}
