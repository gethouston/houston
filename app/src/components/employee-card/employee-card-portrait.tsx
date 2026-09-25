import { cn, HoustonHelmet } from "@houston-ai/core";

export function EmployeeCardPortrait({
  relief,
  dim,
}: {
  relief: string;
  dim: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative size-20 @xs:size-24", dim && "opacity-70")}
    >
      <HoustonHelmet color={relief} className="size-full" />
    </span>
  );
}
