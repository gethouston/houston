import type { ReactNode } from "react";

export function CardActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 md:w-auto md:flex-row md:items-center">
      {children}
    </div>
  );
}

export const CARD_ACTION_CLASS = "h-11 w-full rounded-full md:h-9 md:w-auto";

export const CARD_PRIMARY_ACTION_CLASS = `${CARD_ACTION_CLASS} md:order-last`;
