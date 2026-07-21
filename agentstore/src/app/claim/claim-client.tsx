"use client";

import {
  type StoreAgentSummary,
  StoreApiError,
} from "@houston/agentstore-client";
import { Button, Spinner } from "@houston-ai/core";
import { LogIn } from "lucide-react";
import * as React from "react";
import { useSession } from "@/lib/auth/session";
import { shareUrlForSlug } from "@/lib/site-config";
import { claimAgent, listMyAgents } from "@/lib/store-client";
import { ClaimManage } from "./claim-manage";
import { ClaimNotice, ClaimSuccess } from "./claim-notices";

/** The claim credentials carried in the URL fragment: `#c=<code>&a=<agentId>`. */
interface ClaimParams {
  code: string;
  agentId: string;
}

type ViewState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "claiming" }
  | { status: "error"; message: string }
  | { status: "ready"; agent: StoreAgentSummary }
  | { status: "success"; shareUrl: string };

function readParams(): ClaimParams | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const code = params.get("c")?.trim();
  const agentId = params.get("a")?.trim();
  return code && agentId ? { code, agentId } : null;
}

export function ClaimClient() {
  const { status: sessionStatus, signIn, getToken } = useSession();
  const [state, setState] = React.useState<ViewState>({ status: "loading" });
  const paramsRef = React.useRef<ClaimParams | null>(null);
  const paramsReadRef = React.useRef(false);
  const claimedRef = React.useRef(false);

  if (!paramsReadRef.current && typeof window !== "undefined") {
    paramsRef.current = readParams();
    paramsReadRef.current = true;
  }

  const runClaim = React.useCallback(async () => {
    const params = paramsRef.current;
    if (!params || claimedRef.current) return;
    claimedRef.current = true;
    setState({ status: "claiming" });
    try {
      const token = await getToken();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      try {
        await claimAgent(token, params);
      } catch (err) {
        // A 409 means the agent is already claimed — fine if it is already ours.
        if (!(err instanceof StoreApiError) || err.status !== 409) throw err;
      }
      const mine = await listMyAgents(token);
      const agent = mine.find((a) => a.id === params.agentId);
      if (!agent) {
        setState({
          status: "error",
          message: "This agent has already been claimed by someone else.",
        });
        return;
      }
      if (agent.state === "published" && agent.slug) {
        setState({ status: "success", shareUrl: shareUrlForSlug(agent.slug) });
        return;
      }
      setState({ status: "ready", agent });
    } catch (err) {
      claimedRef.current = false;
      setState({
        status: "error",
        message:
          err instanceof Error ? err.message : "We could not claim this agent.",
      });
    }
  }, [getToken]);

  React.useEffect(() => {
    if (!paramsRef.current && sessionStatus !== "loading") {
      setState({ status: "missing" });
      return;
    }
    if (sessionStatus === "unconfigured") setState({ status: "unconfigured" });
    else if (sessionStatus === "signed-out") setState({ status: "signed-out" });
    else if (sessionStatus === "signed-in" && !claimedRef.current) {
      void runClaim();
    }
  }, [sessionStatus, runClaim]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      {(state.status === "loading" || state.status === "claiming") && (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Spinner />
          {state.status === "claiming" ? "Claiming your agent…" : "Loading…"}
        </div>
      )}

      {state.status === "missing" && (
        <ClaimNotice
          title="No claim link found"
          body="Open the claim link exactly as it was given to you. It carries a private code in the part after #."
        />
      )}

      {state.status === "unconfigured" && (
        <ClaimNotice
          title="Claiming is unavailable"
          body="Sign-in is not configured on this deployment, so agents cannot be claimed here."
        />
      )}

      {state.status === "error" && (
        <ClaimNotice
          title="We could not claim this agent"
          body={state.message}
        />
      )}

      {state.status === "signed-out" && (
        <div className="flex flex-col items-start gap-5">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Claim your agent
            </h1>
            <p className="mt-2 text-muted-foreground">
              Sign in to take ownership of this agent and publish it.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => {
              void signIn().catch(() => {
                /* popup dismissed — the button stays available */
              });
            }}
          >
            <LogIn aria-hidden className="size-4" />
            Sign in to continue
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <ClaimManage
          key={state.agent.id}
          getToken={getToken}
          agent={state.agent}
          onPublished={(shareUrl) => setState({ status: "success", shareUrl })}
        />
      )}

      {state.status === "success" && <ClaimSuccess shareUrl={state.shareUrl} />}
    </main>
  );
}
