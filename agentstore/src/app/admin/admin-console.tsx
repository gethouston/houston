"use client";

import { StoreApiError } from "@houston/agentstore-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@houston-ai/core";
import { Brush, LogIn } from "lucide-react";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import { runPurge } from "@/lib/store-admin-client";
import { QueueTab } from "./queue-tab";
import { ReportsTab } from "./reports-tab";

/**
 * The moderation console. Access is decided by the gateway: admin routes match
 * the caller's UID against `GW_STORE_ADMIN_UIDS` and fail-close to 404, so a
 * signed-in non-admin sees the same "not found" a stranger does — the tabs report
 * it. No shared token; the signed-in user's bearer authorizes every call.
 */
export function AdminConsole() {
  const { status, signIn, getToken } = useSession();

  if (status === "unconfigured") {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <Alert>
          <AlertTitle>Moderation is unavailable</AlertTitle>
          <AlertDescription>
            This deployment is not configured for sign-in.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-24 text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-col gap-5 px-6 py-24">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Moderation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with an admin account to continue.
          </p>
        </div>
        <Button
          onClick={() => {
            void signIn().catch(() => {
              /* popup dismissed */
            });
          }}
        >
          <LogIn aria-hidden className="size-4" /> Sign in
        </Button>
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Moderation
        </h1>
        <PurgeButton getToken={getToken} />
      </header>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Review queue</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-6">
          <QueueTab getToken={getToken} />
        </TabsContent>
        <TabsContent value="reports" className="mt-6">
          <ReportsTab getToken={getToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Runs the retention purge and shows the row counts it deleted. */
function PurgeButton({ getToken }: { getToken: () => Promise<string | null> }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  async function purge() {
    setBusy(true);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      const { draftsDeleted, softDeletedPurged } = await runPurge(token);
      setResult(
        `Purged ${draftsDeleted} drafts, ${softDeletedPurged} deleted.`,
      );
    } catch (err) {
      setResult(
        err instanceof StoreApiError ? err.message : "Purge failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
      <Button variant="outline" size="sm" disabled={busy} onClick={purge}>
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <Brush aria-hidden className="size-4" />
        )}
        Run purge
      </Button>
    </div>
  );
}
