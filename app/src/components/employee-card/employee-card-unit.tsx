import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import type { EmployeeCardLayout } from "./employee-card-model";

export function EmployeeCardUnit({
  layout,
  label,
  card,
}: {
  layout: EmployeeCardLayout;
  label: string;
  card: ReactNode;
}) {
  return (
    <fieldset
      className={cn(
        "min-w-0",
        layout === "grid"
          ? "w-72 max-w-[calc(100dvw-4rem)] md:w-full md:max-w-none"
          : "w-full max-w-xs",
      )}
    >
      <legend className="sr-only">{label}</legend>
      {card}
    </fieldset>
  );
}
