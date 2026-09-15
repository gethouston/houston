import { expect, test } from "vitest";
import { VIEW_RESTS } from "../docs/view-capture";
import { runtimeTransportRoutes } from "../testing/runtime-transport-routes";
import { HOST_SERVED_RESTS, PROXY_MEMBERS } from "./agents-proxy-members";
import { listRoutes } from "./registry/all";

/**
 * THE DRIFT GUARD on the one list the registry cannot derive.
 *
 * Every other route declares itself beside its handler. The proxy family's
 * members are implemented in ANOTHER PACKAGE (packages/runtime's transport),
 * so the declaration here can only be checked against that source — which this
 * reads, in the grammar the transport is written in
 * (testing/runtime-transport-routes.ts).
 */
const TRANSPORT = new URL("../../../runtime/src/transport/", import.meta.url);

/** Captures are compared by shape: `:provider` and `([^/]+)` are the same slot. */
const shapeOf = (rest: string): string =>
  rest
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":param" : segment))
    .join("/");

test("the declared members are exactly what the runtime transport serves", () => {
  const declared = new Set([
    ...PROXY_MEMBERS.map(
      (member) => `${member.method} ${shapeOf(member.rest)}`,
    ),
    ...HOST_SERVED_RESTS.map((rest) => {
      const [method, path] = rest.split(" ");
      return `${method} ${shapeOf(path ?? "")}`;
    }),
  ]);
  expect([...runtimeTransportRoutes(TRANSPORT)].sort()).toEqual(
    [...declared].sort(),
  );
});

test("every member is annotated with an engine that serves it", () => {
  for (const member of PROXY_MEMBERS) {
    expect(member.engines).toContain("standing");
    expect(new Set(member.engines).size).toBe(member.engines.length);
  }
});

const AGENT_PREFIX = "/agents/:agentId/";

test("every captured view rest is a declared per-agent route", () => {
  // docs/view-capture.ts publishes an answer to the managed doc store so the
  // gateway can serve it while the pod SLEEPS. Two of the four are proxied and
  // two the host serves itself, so the guard is that each is a route SOMEONE
  // declared: a captured rest nothing answers would publish a 404 as a view.
  const declared = new Set(
    listRoutes()
      .filter(
        (route) =>
          route.phase === "agent" && route.path.startsWith(AGENT_PREFIX),
      )
      .map((route) => route.path.slice(AGENT_PREFIX.length)),
  );
  for (const rest of Object.keys(VIEW_RESTS)) expect(declared).toContain(rest);
});

test("listRoutes() publishes the family one entry per member", () => {
  const published = listRoutes()
    .filter((route) => route.classification === "runtime-proxy")
    .map((route) => `${route.method} ${route.path}`);
  expect(published).toEqual(
    PROXY_MEMBERS.map(
      (member) => `${member.method} /agents/:agentId/${member.rest}`,
    ),
  );
});
