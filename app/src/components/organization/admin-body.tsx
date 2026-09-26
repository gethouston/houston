import { Skeleton } from "@houston-ai/core";
import type { ReactNode } from "react";
import { PageContainer } from "../shell/page-shell";
import type { AdminBodyState } from "./admin-body-state";

/** The query and gate state selects exactly one Admin body. */
export function AdminBody({
  state,
  loadingLabel,
  unavailableLabel,
  children,
}: {
  state: AdminBodyState;
  loadingLabel: string;
  unavailableLabel: string;
  children: ReactNode;
}) {
  if (state === "pending")
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={loadingLabel}
        className="flex h-full min-h-0 flex-col gap-6 px-6 py-6"
      >
        <div className="flex gap-3">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );

  if (state === "unavailable")
    return (
      <PageContainer className="pt-6 pb-10">
        <p className="py-10 text-sm text-ink-muted">{unavailableLabel}</p>
      </PageContainer>
    );

  return <>{children}</>;
}
