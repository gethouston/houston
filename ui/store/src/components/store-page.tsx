import { cn } from "@houston-ai/core";
import type * as React from "react";

import { storeLayout, storeType } from "../primitives";

function StorePage({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="store-page"
      className={cn(storeLayout.page, className)}
      {...props}
    >
      <div
        className={cn(
          storeLayout.container,
          storeLayout.pagePadding,
          storeLayout.stack,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface StorePageHeaderProps
  extends Omit<React.ComponentProps<"header">, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

function StorePageHeader({
  className,
  title,
  subtitle,
  actions,
  ...props
}: StorePageHeaderProps) {
  return (
    <header
      data-slot="store-page-header"
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-4",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className={storeType.display}>{title}</h1>
        {subtitle ? <p className={storeType.meta}>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface StoreSectionProps
  extends Omit<React.ComponentProps<"section">, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

function StoreSection({
  className,
  title,
  description,
  actions,
  children,
  ...props
}: StoreSectionProps) {
  const hasHead = Boolean(title || description || actions);
  return (
    <section
      data-slot="store-section"
      className={cn(storeLayout.sectionStack, className)}
      {...props}
    >
      {hasHead ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {title ? <h2 className={storeType.sectionTitle}>{title}</h2> : null}
            {description ? (
              <p className={storeType.meta}>{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type { StorePageHeaderProps, StoreSectionProps };
export { StorePage, StorePageHeader, StoreSection };
