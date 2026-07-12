"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from "@houston-ai/core";
import { Check, ExternalLink, X } from "lucide-react";
import * as React from "react";
import { shareUrlForSlug } from "@/lib/site-config";
import {
  type AdminQueueItem,
  actOnQueueItem,
  listAdminQueue,
} from "@/lib/store-admin-client";
import { StoreApiError } from "@/lib/store-client";

type Load =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; items: AdminQueueItem[] };

/** A 404 from an admin route means the caller is not an admin (fail-closed). */
function classify(err: unknown): Load {
  if (err instanceof StoreApiError && err.status === 404) {
    return { status: "forbidden" };
  }
  return {
    status: "error",
    message: err instanceof Error ? err.message : "Could not load the queue.",
  };
}

/**
 * The public-listing review queue. Loads pending requests, then lets an admin
 * approve (go public) or reject (stay unlisted) each agent. A decided card is
 * removed on success; failures surface inline.
 */
export function QueueTab({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      setLoad({ status: "ready", items: await listAdminQueue(token) });
    } catch (err) {
      setLoad(classify(err));
    }
  }, [getToken]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setRowError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      await actOnQueueItem(token, id, action);
      setLoad((prev) =>
        prev.status === "ready"
          ? { status: "ready", items: prev.items.filter((i) => i.id !== id) }
          : prev,
      );
    } catch (err) {
      setRowError(
        err instanceof Error ? err.message : "Could not update that request.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (load.status === "loading") {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <Spinner /> Loading review queue…
      </div>
    );
  }
  if (load.status === "forbidden") {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Your account does not have moderation access.
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{load.message}</AlertDescription>
      </Alert>
    );
  }
  if (load.items.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        No agents are waiting for review.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rowError && (
        <Alert variant="destructive">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}
      {load.items.map((item) => {
        const pageUrl = item.slug ? shareUrlForSlug(item.slug) : null;
        return (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{item.name}</span>
                {pageUrl && (
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Preview <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {item.tagline || item.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.category} · by {item.creator.displayName}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "approve")}
                >
                  <Check aria-hidden className="size-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() => decide(item.id, "reject")}
                >
                  <X aria-hidden className="size-4" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
