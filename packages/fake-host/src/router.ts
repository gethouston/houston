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

function openDomainStream(req: Request): Response {
  return sseResponse(req, (sink) => {
    sink.comment("connected");
    const off = state.onDomainEvent((event) => {
      if (!sink.closed) sink.data(event);
    });
    req.signal.addEventListener("abort", off);
  });
}

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

  if (path === "/v1/events" && method === "GET") return openDomainStream(req);

  const segs = path.split("/").filter(Boolean);
  const body = await parseBody(req);

  if (path === "/health") return json({ status: "ok", version: "e2e" });
  if (path === "/version") return json({ engine: "e2e", protocol: 1 });

  const setupRoute = handleSetupRuntime(method, path, url, body);
  if (setupRoute) return setupRoute;

  if (path === "/v1/capabilities" && method === "GET") {
    return json(state.getCapabilities());
  }
  if (path === "/v1/catalog" && method === "GET") {
    return json(buildProviderCatalog());
  }
  if (path === "/v1/assistant" && method === "GET") {
    return json({ agent: ASSISTANT_AGENT_ID, conversation: "assistant" });
  }
  const sharedSkillsRoute = handleSharedSkillsRoutes(method, segs, body);
  if (sharedSkillsRoute) return sharedSkillsRoute;
  const userRoute = handleUserRoutes(method, segs, body);
  if (userRoute) return userRoute;

  const seatRoute = handleSeatRoutes(method, segs, req, body);
  if (seatRoute) return seatRoute;

  const teamsRoute = handleTeamsRoutes(method, segs, body, url);
  if (teamsRoute) return teamsRoute;

  const spacesRoute = handleSpacesRoutes(method, segs, body);
  if (spacesRoute) return spacesRoute;
  const moveRoute = handleAgentMoveRoutes(method, segs, body);
  if (moveRoute) return moveRoute;

  const priceNoticeRoute = handlePriceNoticeRoutes(method, segs, req);
  if (priceNoticeRoute) return priceNoticeRoute;
  const orgBillingRoute = handleOrgBillingRoutes(method, segs, req, body);
  if (orgBillingRoute) return orgBillingRoute;

  const planRoute = handlePlanRoutes(method, segs, body);
  if (planRoute) return planRoute;
  const choiceRoute = handleBillingChoiceRoutes(method, segs, body);
  if (choiceRoute) return choiceRoute;

  const meRoute = handleMeRoutes(method, segs, body);
  if (meRoute) return meRoute;

  if (segs[0] === "agents") {
    const locked = lockedWriteRefusal(method, segs, req);
    if (locked) return locked;
    if (
      state.arming.agentReadHoldMs > 0 &&
      method === "GET" &&
      segs.length > 1 &&
      segs[2] !== "providers"
    )
      await new Promise((r) => setTimeout(r, state.arming.agentReadHoldMs));
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
