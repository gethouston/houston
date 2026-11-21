import { StatusBadge } from "@houston-ai/core";
import { SpecChip } from "../spec-chip";

export function CapabilityChip({ label }: { label: string }) {
  return <SpecChip>{label}</SpecChip>;
}

export function PriceText({ text }: { text: string }) {
  return (
    <span className="font-mono text-[13px] text-ink-muted tabular-nums">
      {text}
    </span>
  );
}

export function LiveStatus({ label }: { label: string }) {
  return <StatusBadge status="active" label={label} />;
}
