import { describe, expect, test } from "vitest";
import type { AssistantRoute } from "../assistant/catalog";
import { processAssistantCatalog } from "../assistant/catalog-source";
import { buildPath } from "./assistant-request-parts";

/**
 * The address a catalog operation is allowed to build.
 *
 * A path parameter is caller-supplied — on the assistant surface the caller is
 * a language model — and the built path is handed to `new URL(...)`, which
 * RESOLVES `.` and `..` segments before anything sees it. So a parameter that
 * carries dot segments does not address its own operation: it walks onto some
 * other route's address and is then performed with the gateway credential,
 * including routes deliberately withheld from the assistant. These tests pin
 * that a built path always addresses the route it was built from.
 */

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the generated assistant catalog must load");

function route(operation: string): AssistantRoute {
  const found = loaded?.operations.find((op) => op.name === operation)?.route;
  if (!found) throw new Error(`${operation} carries no route`);
  return found;
}

/** The pathname a URL parser actually addresses for a built path. */
const resolved = (path: string) =>
  new URL(`http://houston.test${path}`).pathname;

describe("a path parameter cannot leave its own route", () => {
  // The real shipped route: `path`-encoded `relPath` keeps its separators, so
  // it is the one parameter that can spell more than one segment.
  const readAgentFile = () => route("readAgentFile");

  test("a plain traversal is refused, not sent", () => {
    const built = buildPath(readAgentFile(), {
      agentId: "Work/Sales",
      relPath: "../../../v1/preferences/private-key",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.refusal.code).toBe("invalid_params");
  });

  test("a percent-encoded traversal is refused too", () => {
    // WHATWG resolves `%2e%2e` exactly like `..`, so spelling it encoded is
    // the same attack with a different keyboard.
    const built = buildPath(readAgentFile(), {
      agentId: "Work/Sales",
      relPath: "%2e%2e/%2e%2e/%2e%2e/v1/preferences/private-key",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.refusal.code).toBe("invalid_params");
  });

  test("a single-dot segment is refused", () => {
    const built = buildPath(readAgentFile(), {
      agentId: "Work/Sales",
      relPath: "board/./activity.json",
    });
    expect(built.ok).toBe(false);
  });

  test("an empty segment is refused", () => {
    const built = buildPath(readAgentFile(), {
      agentId: "Work/Sales",
      relPath: "board//activity.json",
    });
    expect(built.ok).toBe(false);
  });

  test("a segment parameter carrying a traversal is refused", () => {
    // `agentId` is `segment`-encoded, and `encodeURIComponent("..")` is still
    // `..`, so the escaping alone does not stop it.
    const built = buildPath(route("listActivities"), { agentId: ".." });
    expect(built.ok).toBe(false);
  });

  test("a legitimate nested path still addresses its own file", () => {
    const built = buildPath(readAgentFile(), {
      agentId: "Work/Sales",
      relPath: "board/activity one.json",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toBe(
      "/agents/Work%2FSales/agentfile/board/activity%20one.json",
    );
    expect(resolved(built.value)).toBe(built.value);
  });

  test("dots inside a file name are not dot segments", () => {
    const built = buildPath(readAgentFile(), {
      agentId: "Sales",
      relPath: ".hidden/notes..md",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value).toBe("/agents/Sales/agentfile/.hidden/notes..md");
    expect(resolved(built.value)).toBe(built.value);
  });

  test("every accepted path resolves to itself", () => {
    // The invariant behind the checks above, asserted directly: whatever a
    // caller supplies, the address the URL parser lands on is the address the
    // route declared.
    const hostile = [
      "..",
      ".",
      "%2e%2e",
      "%2E",
      ".%2e",
      "%2e.",
      "a/../../b",
      "..%2f..",
      "/etc/passwd",
      "\\..\\..",
      "a\u0000b",
      "a\nb",
    ];
    for (const relPath of hostile) {
      const built = buildPath(readAgentFile(), { agentId: "A", relPath });
      if (!built.ok) continue;
      expect(
        resolved(built.value),
        `relPath ${JSON.stringify(relPath)} moved the address`,
      ).toBe(built.value);
      expect(built.value.startsWith("/agents/A/agentfile/")).toBe(true);
    }
  });
});

test.each([
  "../..",
  "%252e%252e",
  "..%252f..",
  "a/b",
  "a\\b",
  "a%255cb",
  "a\u0000b",
])("rejects decoded segment escape %s", (id) => {
  expect(
    buildPath(route("deleteRoutine"), { agentId: "Work/Ada", id }).ok,
  ).toBe(false);
});
test.each(["../..", "Work/..", "Work/%252e%252e", "Work%252f.."])(
  "rejects traversing agent identity %s",
  (agentId) => {
    expect(buildPath(route("listActivities"), { agentId }).ok).toBe(false);
  },
);
