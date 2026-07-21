"use client";

import type { CreatorAnalytics } from "@houston/agentstore-client";
import { Alert, AlertDescription, Button, Spinner } from "@houston-ai/core";
import * as React from "react";
import { InstallsBars } from "@/components/installs-bars";
import { toDayBars } from "@/lib/analytics-model";
import { getMyAnalytics } from "@/lib/store-client";

const RANGES: ReadonlyArray<{ days: number; label: string }> = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CreatorAnalytics };

/**
 * The owner's install analytics panel: a range toggle (7 / 30 / 90 days), the
 * total install count, and a per-day bar chart. Owner-only; reads through the
 * gateway with the caller's bearer. Every failure is a visible message.
 */
export function MeAnalytics({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const [days, setDays] = React.useState(30);
  const [load, setLoad] = React.useState<Load>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session expired. Sign in again.");
        const data = await getMyAnalytics(token, days);
        if (!cancelled) setLoad({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setLoad({
            status: "error",
            message:
              err instanceof Error ? err.message : "Could not load analytics.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, getToken]);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Installs</h2>
          {load.status === "ready" && (
            <p className="text-sm text-muted-foreground">
              {compactNumber.format(load.data.totals.installs)} total in this
              range
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <Button
              key={range.days}
              size="sm"
              variant={days === range.days ? "default" : "outline"}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      </div>

      {load.status === "loading" && (
        <div className="flex items-center gap-3 py-8 text-muted-foreground">
          <Spinner /> Loading analytics…
        </div>
      )}
      {load.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}
      {load.status === "ready" && (
        <InstallsBars bars={toDayBars(load.data.rows)} />
      )}
    </section>
  );
}
