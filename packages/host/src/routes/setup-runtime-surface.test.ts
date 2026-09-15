import { expect, test } from "vitest";
import { listRoutes } from "./registry/all";
import { matchPath } from "./registry/match";

/**
 * The pre-agent connect surface is an ALLOWLIST, and the hosted gateway mirrors
 * it verbatim in front of the org's setup pod (cloud
 * `internal/edge/setupruntime/routes.go`). So the enumeration is pinned from
 * both directions: the declared family is exactly this list, and a sub-path
 * that is not on it reaches no pattern — the runtime's chat, settings and
 * above all `auth/export` (a refresh token) stay unreachable before an agent
 * exists.
 */
const SURFACE = [
  "POST /setup-runtime/credential/capture",
  "POST /setup-runtime/credential/forget",
  "POST /setup-runtime/credential/api-key",
  "POST /setup-runtime/credential/claude-oauth",
  "GET /setup-runtime/providers",
  "GET /setup-runtime/auth/status",
  "POST /setup-runtime/auth/:provider/login",
  "POST /setup-runtime/auth/:provider/login/complete",
  "POST /setup-runtime/auth/:provider/login/cancel",
  "POST /setup-runtime/auth/:provider/logout",
];

const declared = () =>
  listRoutes().filter((route) => route.group === "setup-runtime");

test("the declared family is exactly the connect surface", () => {
  expect(declared().map((route) => `${route.method} ${route.path}`)).toEqual(
    SURFACE,
  );
});

/** What a pre-agent client must never reach, with the method it would use. */
const REFUSED: [string, string][] = [
  ["GET", "/setup-runtime/auth/export"],
  ["POST", "/setup-runtime/auth/export"],
  ["POST", "/setup-runtime/auth/openai-codex/api-key"],
  ["POST", "/setup-runtime/conversations/c1/messages"],
  ["GET", "/setup-runtime/conversations"],
  ["PUT", "/setup-runtime/settings"],
  ["POST", "/setup-runtime/settings/claim"],
  ["GET", "/setup-runtime/files"],
  ["POST", "/setup-runtime/generate-agent"],
  ["POST", "/setup-runtime/credential/capture/extra"],
  ["GET", "/setup-runtime/"],
  ["GET", "/setup-runtime"],
  // A declared path with an undeclared method is off the surface too: a GET
  // never captures a credential, and a POST never lists providers.
  ["GET", "/setup-runtime/credential/capture"],
  ["POST", "/setup-runtime/providers"],
];

test("nothing outside the connect surface matches a declared pattern", () => {
  const reachable = REFUSED.filter(([method, path]) =>
    declared().some(
      (route) => route.method === method && matchPath(route.path, path),
    ),
  );
  expect(reachable).toEqual([]);
});

test("every declared member matches the path a client sends", () => {
  const sent = (path: string) => path.replace(":provider", "openai-codex");
  const unreachable = declared().filter(
    (route) => !matchPath(route.path, sent(route.path)),
  );
  expect(unreachable).toEqual([]);
});
