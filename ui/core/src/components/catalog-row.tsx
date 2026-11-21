"use client";

import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { cn } from "../utils";
import {
  type CatalogRowSurface,
  catalogRowSurfaceClasses,
} from "./catalog-row-surface";

const ACTION_ATTR = "data-catalog-row-action";

const ROW_PX = "px-3";

export interface CatalogRowProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children" | "onClick"> {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  statusDot?: ReactNode;
  trailing?: ReactNode;
  aside?: ReactNode;
  below?: ReactNode;
  action?: ReactNode;
  surface?: CatalogRowSurface;
  onClick?: () => void;
}

export function CatalogRow({
  icon,
  title,
  description,
  statusDot,
  trailing,
  aside,
  below,
  action,
  className,
  onClick,
  disabled,
  surface = "plane",
  ...rest
}: CatalogRowProps) {
  const open = disabled ? undefined : onClick;
  const paint = catalogRowSurfaceClasses(surface, open != null);
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`[${ACTION_ATTR}]`)) return;
    open?.();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a role that made this wrapper interactive is precisely the bug — see above.
    <div
      role="presentation"
      onClick={open ? handleClick : undefined}
      className={cn(
        "w-full scroll-mt-16 rounded-xl transition-[background-color,scale] hover:bg-hover focus-within:bg-hover motion-reduce:transition-none",
        paint.root,
        open && "cursor-pointer",
        className,
      )}
    >
      <div className="flex w-full items-center">
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-left",
            ROW_PX,
            "focus-visible:outline-none",
            paint.body,
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          {...rest}
        >
          {icon}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-medium text-ink text-sm">
              {statusDot}
              <span className="truncate">{title}</span>
            </p>
            {description && (
              <p className="truncate text-[13px] text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {trailing}
        </button>
        {aside && (
          <div className="pointer-events-none shrink-0 pr-3">{aside}</div>
        )}
        {action && (
          <div {...{ [ACTION_ATTR]: "" }} className="shrink-0 pr-2.5">
            {action}
          </div>
        )}
      </div>
      {below && <div className={cn("pb-2.5", ROW_PX)}>{below}</div>}
    </div>
  );
}
