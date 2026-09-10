import { cn } from "@houston-ai/core";

export function MetaRow({
  label,
  value,
  scroll = false,
}: {
  label: string;
  value: string;
  scroll?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 text-ink",
          scroll ? "overflow-x-auto whitespace-nowrap" : "truncate",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
