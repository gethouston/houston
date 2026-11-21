import { createServer, type Server } from "node:http";
import { handleBrowserLiveRoute } from "../transport/browser-live-route";
import { AdmissionLimiter, turnConcurrency } from "./admission";
import { makeLoginRunnerRoutes } from "./login-runner-routes";
import {
  authorized,
  incarnationOK,
  json,
  wireErrorMessage,
} from "./server-http";
import { servePrewarm } from "./server-prewarm";
import type { TurnServerDeps } from "./server-types";
import { serveOp, serveTurn } from "./server-work";
import { ProviderWarmer } from "./turn-provider-warm";

export type { TurnServerDeps } from "./server-types";

const BROWSER_LIVE_PATH = /^\/conversations\/[^/]+\/browser\/(?:live|input)$/;

export function createTurnServer(deps: TurnServerDeps): Server {
  const admission =
    deps.admission ??
    new AdmissionLimiter(deps.concurrency ?? turnConcurrency());
  const warmer = deps.providerWarmer ?? new ProviderWarmer();
  let use: "login" | "work" | undefined;
  let loginBegin: Promise<void> | undefined;
  const login = makeLoginRunnerRoutes(deps.loginRunner);
  return createServer((req, res) => {
    const arrival: Record<string, number> = { t_arrived: performance.now() };
    (async () => {
      const path = (req.url || "/").split("?")[0];
      if (req.method === "GET" && path === "/health") {
        if (use === "login" || deps.isDraining?.()) {
          return json(res, 503, { status: "draining", mode: "turn" });
        }
        return json(res, 200, { status: "ok", mode: "turn" });
      }
      if (req.method === "GET" && path === "/v1/capabilities") {
        return json(
          res,
          200,
          (deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL)
            ? { localModelBridge: { versions: [1] } }
            : {},
        );
      }
      if (BROWSER_LIVE_PATH.test(path)) {
        if (!authorized(req, deps.token)) {
          return json(res, 401, { error: "unauthorized" });
        }
        if (!incarnationOK(req, deps.podUid, Boolean(deps.singleUse))) {
          return json(res, 409, { error: "pod_uid_mismatch" });
        }
        const url = new URL(req.url || "/", "http://turn.invalid");
        const method = req.method || "GET";
        if (await handleBrowserLiveRoute({ req, res, url, path, method }))
          return;
        return json(res, 404, { error: "not found" });
      }
      const isLogin = path.startsWith("/login/");
      if (
        !isLogin &&
        (req.method !== "POST" ||
          (path !== "/turn" && path !== "/op" && path !== "/prewarm"))
      ) {
        return json(res, 404, { error: "not found" });
      }
      if (!authorized(req, deps.token)) {
        return json(res, 401, { error: "unauthorized" });
      }
      if (!incarnationOK(req, deps.podUid, Boolean(deps.singleUse))) {
        return json(res, 409, { error: "pod_uid_mismatch" });
      }
      if (
        isLogin
          ? use === "work" || (use !== "login" && deps.isDraining?.())
          : use === "login" || deps.isDraining?.()
      ) {
        return json(
          res,
          503,
          { error: "worker_draining" },
          { "Retry-After": "1" },
        );
      }
      if (isLogin) {
        if (!use) {
          use = "login";
          loginBegin = Promise.resolve().then(() => deps.singleUse?.begin());
        }
        await loginBegin;
        await login(req, res);
        return;
      }
      use = "work";
      if (path === "/prewarm") return servePrewarm(warmer, req, res);
      if (path === "/op") {
        await serveOp(deps, admission, req, res);
      } else {
        warmer.stop();
        await serveTurn(deps, admission, req, res, arrival);
      }
    })().catch((error) => {
      const message = wireErrorMessage(error);
      console.error("[turn] unhandled:", message);
      if (!res.headersSent) json(res, 500, { error: message });
      else if (!res.writableEnded) res.end();
    });
  });
}
