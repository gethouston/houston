import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { headerLozengeClasses, headerLozengeTrack } from "./header-lozenge";

export function PageHeaderBackChip({
  label,
  icon,
  onClick,
  dataAttrs,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <span className={headerLozengeTrack("shrink-0")}>
      <button
        type="button"
        {...dataAttrs}
        onClick={onClick}
        className={headerLozengeClasses(false)}
      >
        <ChevronLeft aria-hidden className="-ml-0.5 size-4 shrink-0" />
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </span>
  );
}
