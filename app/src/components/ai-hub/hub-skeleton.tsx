/**
 * A calm placeholder while the local catalog resolves. It loads from bundled
 * JSON so this flashes only for a frame; nothing flashy, just three muted bars.
 */
export function HubSkeleton({ loading }: { loading: boolean }) {
  if (!loading) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-40 rounded-lg bg-chip" />
      <div className="h-4 w-2/3 rounded-lg bg-chip" />
      <div className="mt-4 h-9 w-56 rounded-full bg-chip" />
    </div>
  );
}
