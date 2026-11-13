/**
 * The fake host's request router: a pure `Request -> Response` function with no
 * Node HTTP coupling, so it can be unit-tested and driven by any adapter.
 *
 * Answers just enough of the host + per-agent runtime for the desktop UI
 * (app/src) to boot and run on the new-engine adapter in host mode — with NO
 * real backend, no AI provider, no credentials. Deterministic and hermetic.
 */

import { buildProviderCatalog } from "@houston/host/src/providers/pi-catalog";
import { ASSISTANT_AGENT_ID } from "./config";
import { CORS, json, parseBody } from "./http";
import { handleAgents } from "./routes";
import { handleAgentMoveRoutes } from "./routes-agent-move";
import { handleBillingChoiceRoutes } from "./routes-billing-choice";
import { handleUserRoutes } from "./routes-integrations";
import { handleMeRoutes } from "./routes-me";
import {
  handleOrgBillingRoutes,
  lockedWriteRefusal,
} from "./routes-org-billing";
import { handlePlanRoutes } from "./routes-plan";
import { handlePriceNoticeRoutes } from "./routes-price-notice";
import { handleSeatRoutes } from "./routes-seats";
import { handleSetupRuntime } from "./routes-setup-runtime";
import { handleSharedSkillsRoutes } from "./routes-shared-skills";
import { handleSpacesRoutes } from "./routes-spaces";
import { handleTeamsRoutes } from "./routes-teams";
import { handleFakeUploads } from "./routes-uploads";
import { sseResponse } from "./sse";
import * as state from "./state";
import { handleAccountControls } from "./test-controls-account";
import { handleChatControls } from "./test-controls-chat";
import { handleStateControls } from "./test-controls-state";

/** Global reactivity feed (`GET /v1/events`). Mirrors the host's SSE shape:
 *  `data: { type, agentPath, workspaceId }`. control-plane.ts subscribeEvents
 *  translates these into TanStack Query invalidations. */
function openDomainStream(req: Request): Response {
  return sseResponse(req, (sink) => {
    sink.comment("connected");
    const off = state.onDomainEvent((event) => {
      if (!sink.closed) sink.data(event);
    });
    req.signal.addEventListener("abort", off);
  });
}

/** Route one request to a `Response`. The single entry point for every adapter. */
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (process.env.FAKE_HOST_LOG && method !== "OPTIONS")
    console.log(`[fake-host] ${method} ${path}`);

  if (method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  const uploadResponse = await handleFakeUploads(req, handle);
  if (uploadResponse) return uploadResponse;

  if (path.startsWith("/__test__/")) {
    for (const controls of [
      handleChatControls,
      handleStateControls,
      handleAccountControls,
    ]) {
      const response = await controls(req);
      if (response) return response;
    }
  }

  // --- global reactivity feed ---
  if (path === "/v1/events" && method === "GET") return openDomainStream(req);

  const segs = path.split("/").filter(Boolean);
  const body = await parseBody(req);

  // --- top-level host probes ---
  if (path === "/health") return json({ status: "ok", version: "e2e" });
  if (path === "/version") return json({ engine: "e2e", protocol: 1 });

  // --- pre-agent connect surface (the WebApp gate + ConnectView) ---
  // The real host serves this ONLY under /setup-runtime/* — no flat
  // /auth/status or /providers exists there, so none exists here either.
  const setupRoute = handleSetupRuntime(method, path, url, body);
  if (setupRoute) return setupRoute;

  // --- misc host surface the UI may touch on boot (kept permissive) ---
  // Deployment capabilities: single-player local by default (the app's boot
  // routing waits on this — App.tsx gates onboarding-vs-shell on loaded
  // capabilities). Armed to a Teams-shaped set by `/__test__/capabilities`.
  if (path === "/v1/capabilities" && method === "GET") {
    return json(state.getCapabilities());
  }
  // pi-ai's full static model catalog (`GET /v1/catalog`, wire `ProviderCatalog`).
  // Built from the SAME real `buildProviderCatalog` the host route uses, so the
  // mock can't drift from the wire contract — the app's `getCatalog()` hydrates
  // the picker + AI Models tab from it. It returns every runnable provider on
  // every deployment (no profile gating). Without this the route 404'd,
  // `getCatalog()` degraded to `[]`, and the picker fell back to the override-only
  // seed (no models).
  if (path === "/v1/catalog" && method === "GET") {
    return json(buildProviderCatalog());
  }
  // Personal-assistant discovery (`GET /v1/assistant`, `AssistantHandle`): the
  // address the rail's Manager row and its screen are gated on. Like the real
  // host it answers a hidden agent off the roster, so a first run (an empty
  // roster) still has its manager; the chat that opens rides the ordinary
  // per-agent runtime routes, which is the contract under test. The
  // conversation id is the host's own constant, and no activity is created for
  // it, so the assistant thread stays off every board as it does in production.
  if (path === "/v1/assistant" && method === "GET") {
    return json({ agent: ASSISTANT_AGENT_ID, conversation: "assistant" });
  }
  const sharedSkillsRoute = handleSharedSkillsRoutes(method, segs, body);
  if (sharedSkillsRoute) return sharedSkillsRoute;
  // --- user-scoped gateway routes (integrations, preferences, locale) ---
  const userRoute = handleUserRoutes(method, segs, body);
  if (userRoute) return userRoute;

  // --- yearly seats: the quote, and the seat side of an add or a removal ---
  const seatRoute = handleSeatRoutes(method, segs, req, body);
  if (seatRoute) return seatRoute;

  // --- Teams v2 gateway routes (agent + org settings / allowlist ceilings) ---
  const teamsRoute = handleTeamsRoutes(method, segs, body, url);
  if (teamsRoute) return teamsRoute;

  // --- C8 Spaces gateway routes (the cross-org list + the invitee's inbox) ---
  const spacesRoute = handleSpacesRoutes(method, segs, body);
  if (spacesRoute) return spacesRoute;
  const moveRoute = handleAgentMoveRoutes(method, segs, body);
  if (moveRoute) return moveRoute;

  const priceNoticeRoute = handlePriceNoticeRoutes(method, segs, req);
  if (priceNoticeRoute) return priceNoticeRoute;
  const orgBillingRoute = handleOrgBillingRoutes(method, segs, req, body);
  if (orgBillingRoute) return orgBillingRoute;

  // --- C19 personal plan (per person, across spaces) ---
  const planRoute = handlePlanRoutes(method, segs, body);
  if (planRoute) return planRoute;
  const choiceRoute = handleBillingChoiceRoutes(method, segs, body);
  if (choiceRoute) return choiceRoute;

  // --- the caller's own editable display profile (name + photo) ---
  const meRoute = handleMeRoutes(method, segs, body);
  if (meRoute) return meRoute;

  // --- everything under /agents/* ---
  if (segs[0] === "agents") {
    const locked = lockedWriteRefusal(method, segs, req);
    if (locked) return locked;
    // Armed cold-start hold: per-agent READS stall like they do behind the
    // cloud gateway while a pod wakes. The agent LIST (`GET /agents`) stays
    // instant — in the real deployment it is a gateway answer, not a pod one.
    // The runtime-proxy `providers` probes are exempt too: they are not what
    // this control models, and holding them exhausts the browser's HTTP/1.1
    // six-connection budget against the dev server, stalling even unheld
    // boot routes — an artifact the real HTTP/2 gateway doesn't have.
    if (
      state.arming.agentReadHoldMs > 0 &&
      method === "GET" &&
      segs.length > 1 &&
      segs[2] !== "providers"
    )
      await new Promise((r) => setTimeout(r, state.arming.agentReadHoldMs));
    // Armed per-agent read failure: this agent's pod is unreachable while the
    // rest of the fleet answers. Same shape the gateway returns for a pod it
    // cannot reach, so the client's own error path runs unchanged. With
    // `segments` armed only those sub-resources fail, which is the subtler
    // half-broken state: one route down while the same agent answers the rest.
    const failingSegments = state.arming.failingAgentReadSegments;
    if (
      method === "GET" &&
      segs.length > 1 &&
      state.arming.failingAgentReads.has(decodeURIComponent(segs[1])) &&
      (failingSegments === null ||
        (segs.length > 2 && failingSegments.has(decodeURIComponent(segs[2]))))
    )
      return json({ error: { message: "agent unreachable" } }, 500);
    return handleAgents(
      method,
      segs.slice(1).map(decodeURIComponent),
      req,
      body,
    );
  }

  console.warn(`[fake-host] 404 ${method} ${path}`);
  return json({ error: { message: `no fake route for ${path}` } }, 404);
}
