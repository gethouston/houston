export function ReviewEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center pt-[20vh] gap-4 px-8">
      <div className="space-y-2 text-center max-w-md">
        <h1 className="text-2xl font-semibold text-ink tracking-tight">
          All caught up
        </h1>
        <p className="text-base text-ink-muted leading-relaxed">
          No items need your review. Your routines will produce new outputs
          automatically, or ask Houston for a one-off task.
        </p>
      </div>
    </div>
  );
}
