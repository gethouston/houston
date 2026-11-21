export function HubSkeleton({ loading }: { loading: boolean }) {
  if (!loading) return null;
  return (
    <div className="flex flex-col gap-6">
      <div className="h-5 w-24 rounded-lg bg-chip" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-24 rounded-xl bg-chip" />
        <div className="h-24 rounded-xl bg-chip" />
      </div>
      <div className="h-8 w-48 rounded-full bg-chip" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-32 rounded-xl bg-chip" />
        <div className="h-32 rounded-xl bg-chip" />
      </div>
    </div>
  );
}
