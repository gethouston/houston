"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils";

export function CatalogCount({
  count,
  className,
}: {
  count: number | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full bg-chip-subtle px-1.5 py-0.5 font-medium text-[11px] text-ink-muted leading-none tabular-nums",
        className,
      )}
    >
      {count}
    </span>
  );
}

export function CatalogSectionHeader({
  title,
  count,
  size = "sm",
  as: Tag = "h2",
  className,
}: {
  title: string;
  count?: number | string;
  size?: "sm" | "lg";
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "flex items-center gap-2 text-ink",
        size === "lg" ? "text-sm font-medium" : "text-[13px] font-medium",
        className,
      )}
    >
      {title}
      {count != null && <CatalogCount count={count} />}
    </Tag>
  );
}

export const CATALOG_PLANE_MAX_W = "max-w-[46.25rem]";

export function CatalogGrid({
  children,
  className,
  columns = "auto",
}: {
  children: ReactNode;
  className?: string;
  columns?: "auto" | 1;
}) {
  return (
    <div className="@container">
      <div
        className={cn(
          "grid grid-cols-1 gap-1",
          columns === "auto" && "@2xl:grid-cols-[repeat(2,minmax(0,23rem))]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function CatalogShowMore({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "mt-1 px-3 text-[13px] text-ink-muted transition-colors hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
