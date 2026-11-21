export function KanbanTag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[18px] min-w-0 max-w-full items-center rounded-full bg-chip px-2 text-[10px] font-medium text-ink-muted">
      <span className="truncate">{label}</span>
    </span>
  );
}
