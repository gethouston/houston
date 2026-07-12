import { Alert, AlertDescription, AlertTitle } from "@houston-ai/core";
import { AlertTriangle, PackageOpen } from "lucide-react";
import Link from "next/link";

/** The empty state shown when the signed-in owner has no agents yet. */
export function MeEmpty() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <PackageOpen aria-hidden className="size-6" />
      </span>
      <h2 className="mt-5 font-display text-xl font-semibold">No agents yet</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
        Publish an agent from Houston, or claim one you built with the link the
        app gave you.
      </p>
      <Link
        href="/explore"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Explore the store
      </Link>
    </div>
  );
}

/** A plain informational notice (e.g. sign-in unavailable). */
export function MeNotice({ title, body }: { title: string; body: string }) {
  return (
    <Alert>
      <AlertTriangle aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
