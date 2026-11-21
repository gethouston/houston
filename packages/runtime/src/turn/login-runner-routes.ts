import type { IncomingMessage, ServerResponse } from "node:http";
import { type LoginRunner, loadLoginRunner } from "./login-runner";
import { json, readJson, wireErrorMessage } from "./server-http";

export function makeLoginRunnerRoutes(injected?: LoginRunner) {
  let runner: Promise<LoginRunner> | undefined;
  let provider: string | undefined;
  let started: Promise<unknown> | undefined;
  let terminal = false;
  let operation: "login" | "api-key" | undefined;
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://worker");
    const path = url.pathname;
    const get = path === "/login/status" || path === "/login/credential";
    if (
      (get ? req.method !== "GET" : req.method !== "POST") ||
      ![
        "/login/start",
        "/login/status",
        "/login/complete",
        "/login/cancel",
        "/login/credential",
        "/login/api-key",
      ].includes(path)
    ) {
      return json(res, 404, { error: "not found" });
    }
    let requested = "";
    try {
      const raw = get ? {} : await readJson(req, 64 * 1024);
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("body must be a JSON object");
      const body = raw as Record<string, unknown>;
      requested = get
        ? (url.searchParams.get("provider") ?? "")
        : typeof body.provider === "string"
          ? body.provider
          : "";
      if (!requested) throw new Error("missing provider");
      if (terminal || (provider && provider !== requested)) {
        return json(res, 409, { error: "worker_draining" });
      }
      if (path === "/login/start") {
        provider = requested;
        operation = "login";
      } else if (path === "/login/api-key") {
        if (operation) return json(res, 409, { error: "worker_draining" });
        provider = requested;
        operation = "api-key";
        terminal = true;
      }
      runner ??= injected ? Promise.resolve(injected) : loadLoginRunner();
      const api = await runner;
      if (path === "/login/start") {
        provider = requested;
        started ??= api.start(
          requested,
          body.deviceAuth !== false,
          typeof body.enterpriseDomain === "string"
            ? body.enterpriseDomain
            : undefined,
        );
        return json(res, 200, { info: await started });
      }
      if (path === "/login/status") {
        const status = api.status(requested);
        return status
          ? json(res, 200, status)
          : json(res, 404, { error: "no login in progress" });
      }
      if (path === "/login/credential") {
        const credential = api.credential(requested);
        return credential
          ? json(res, 200, credential)
          : json(res, 404, { error: "no credential" });
      }
      if (path === "/login/complete") {
        if (typeof body.code !== "string") throw new Error("missing code");
        api.complete(requested, body.code);
      } else if (path === "/login/cancel") {
        api.cancel(requested);
        terminal = true;
      } else {
        if (typeof body.apiKey !== "string") throw new Error("missing API key");
        const credential = await api.apiKey(
          requested,
          body.apiKey,
          typeof body.endpoint === "string" ? body.endpoint : undefined,
        );
        return json(res, 200, { credential });
      }
      return json(res, 200, { ok: true });
    } catch (error) {
      const api = runner ? await runner.catch(() => undefined) : undefined;
      return json(
        res,
        path === "/login/api-key" ? 502 : 400,
        api
          ? api.failure(requested, error)
          : { error: wireErrorMessage(error) },
      );
    }
  };
}
