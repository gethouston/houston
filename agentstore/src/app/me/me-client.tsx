"use client";

import type { AgentPatch, StoreAgentSummary } from "@houston/agentstore-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Spinner,
} from "@houston-ai/core";
import { AlertTriangle, LogIn, UserPen } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import { deleteAgent, listMyAgents, patchAgent } from "@/lib/store-client";
import { MeAgentCard } from "./me-agent-card";
import { MeAnalytics } from "./me-analytics";
import { MeEmpty, MeNotice } from "./me-empty";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; agents: StoreAgentSummary[] };

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function MeClient() {
  const { status: sessionStatus, user, signIn, getToken } = useSession();
  const [load, setLoad] = React.useState<LoadState>({ status: "loading" });
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      const agents = await listMyAgents(token);
      setLoad({ status: "ready", agents });
    } catch (err) {
      setLoad({ status: "error", message: errorText(err) });
    }
  }, [getToken]);

  React.useEffect(() => {
    if (sessionStatus === "signed-in") void reload();
  }, [sessionStatus, reload]);

  const runMutation = React.useCallback(
    async (id: string, mutate: (token: string) => Promise<void>) => {
      setPendingId(id);
      setActionError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session expired. Sign in again.");
        await mutate(token);
        await reload();
      } catch (err) {
        setActionError(errorText(err));
      } finally {
        setPendingId(null);
      }
    },
    [getToken, reload],
  );

  if (sessionStatus === "unconfigured") {
    return (
      <MeNotice
        title="Sign-in is unavailable"
        body="This deployment is not configured for accounts, so there is no dashboard here."
      />
    );
  }

  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }

  if (sessionStatus === "signed-out" || !user) {
    return (
      <div className="flex flex-col items-start gap-5">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Your agents
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to see and manage the agents you have published.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => {
            void signIn().catch(() => {
              /* popup dismissed */
            });
          }}
        >
          <LogIn aria-hidden className="size-4" /> Sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Your agents
          </h1>
          <p className="mt-2 text-muted-foreground">
            Publish, unpublish, and manage the visibility of the agents you own.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/me/profile">
            <UserPen aria-hidden className="size-4" /> Edit profile
          </Link>
        </Button>
      </header>

      <MeAnalytics getToken={getToken} />

      {actionError && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {load.status === "loading" && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Spinner /> Loading your agents…
        </div>
      )}

      {load.status === "error" && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>Could not load your agents</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}

      {load.status === "ready" &&
        (load.agents.length === 0 ? (
          <MeEmpty />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {load.agents.map((agent) => (
              <li key={agent.id}>
                <MeAgentCard
                  agent={agent}
                  busy={pendingId === agent.id}
                  onPatch={(patch: AgentPatch) =>
                    void runMutation(agent.id, (t) =>
                      patchAgent(t, agent.id, patch),
                    )
                  }
                  onDelete={() =>
                    void runMutation(agent.id, (t) => deleteAgent(t, agent.id))
                  }
                />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
