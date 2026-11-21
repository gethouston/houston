import type { ReactNode } from "react";
import { BackControl } from "./back-control";

export function BackBarScreen({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4 pb-2 md:px-8 md:pt-8">
        <BackControl label={backLabel} onClick={onBack} />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}
