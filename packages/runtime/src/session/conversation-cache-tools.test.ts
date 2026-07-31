import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

/**
 * PARITY GUARD for the pi backend's custom-tool registration.
 *
 * pi exposes the INTERSECTION of two independent lists: the mode's NAME
 * allowlist (`buildToolSelection` → `toolNamesForMode`, applied in
 * backends/pi/backend.ts) and the registered custom-tool OBJECTS
 * (`createPiBackend({ customTools })`). A name present in the allowlist with no
 * matching tool object is INVISIBLE to the model — silently, with no error
 * anywhere. That is exactly how `suggest_actions` shipped allowlisted but
 * unregistered on pi (the default backend for EVERY non-Anthropic provider),
 * so follow-up suggestions never appeared outside Anthropic while the product
 * prompt mandated the call on every non-blocking finish.
 *
 * These tests pin the pi set the way backends/claude/custom-tools.test.ts pins
 * the Claude set: by capturing what conversation-cache actually hands
 * `createPiBackend` at module load, under both the closed-gate and open-gate
 * configurations.
 */

// Captured from the mocked pi backend factory. `vi.hoisted` so the (hoisted)
// `vi.mock` factory below can close over it without a TDZ error.
const captured = vi.hoisted(() => ({
  tools: [] as string[],
  customTools: [] as string[],
}));

vi.mock("../backends/pi/backend", () => ({
  createPiBackend: (deps: {
    tools: string[];
    customTools: { name: string }[];
  }) => {
    captured.tools = [...deps.tools];
    captured.customTools = deps.customTools.map((t) => t.name);
    return {
      id: "pi",
      createSession: () => {
        throw new Error("conversation-cache-tools.test never runs a turn");
      },
    };
  },
}));

/**
 * pi's OWN built-in tools: allowlisted by name but supplied by pi itself, so
 * they legitimately have no Houston tool object. Everything else in the
 * allowlist is a Houston custom tool and MUST be registered. `read/ls/grep/
 * find/edit/write` are NOT here on purpose — Houston shadows pi's builtins with
 * its workspace-clamped versions (tools/clamped-fs.ts), which are registered.
 */
const PI_BUILTIN_TOOL_NAMES = new Set(["bash"]);

const unregistered = (tools: string[], customTools: string[]): string[] =>
  tools.filter(
    (name) => !PI_BUILTIN_TOOL_NAMES.has(name) && !customTools.includes(name),
  );

/** Put an env var back exactly as it was — UNSET stays unset, never "undefined". */
function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// Throwaway dirs BEFORE the module graph loads (config reads env at import).
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cct-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cct-ws-"),
);

await import("./conversation-cache");
// Snapshot immediately: the open-gate test below re-imports the module and
// overwrites `captured`.
const base = {
  tools: [...captured.tools],
  customTools: [...captured.customTools],
};

test("pi registers a custom tool object for every allowlisted custom-tool name", () => {
  // The invariant that would have caught suggest_actions: no allowlisted name
  // may lack its tool object, or the model simply never sees the tool.
  expect(unregistered(base.tools, base.customTools)).toEqual([]);
});

test("pi's customTools include suggest_actions", () => {
  // Direct regression pin (HOU: follow-up suggestions missing on every
  // non-Anthropic provider). The product prompt MANDATES this call on every
  // turn that ends without a blocking ask, so it must be registered here, not
  // only on the Claude backend.
  expect(base.customTools).toContain("suggest_actions");
});

test("pi's always-on custom tool set is exactly the ungated Houston tools", () => {
  // Mirrors backends/claude/custom-tools.test.ts: an exact set, so ADDING a
  // custom tool without registering it on both backends fails here.
  expect(new Set(base.customTools)).toEqual(
    new Set([
      "read",
      "ls",
      "grep",
      "find",
      "edit",
      "write",
      "ask_user",
      "plan_ready",
      "suggest_reusable",
      "suggest_actions",
    ]),
  );
});

test("the suggest tools survive the execute and auto allowlists but not plan", async () => {
  const { toolNamesForMode } = await import("./tool-selection");
  for (const mode of ["execute", "auto"] as const) {
    const allowed = toolNamesForMode(mode, base.tools);
    expect(allowed).toContain("suggest_actions");
    expect(allowed).toContain("suggest_reusable");
    // Still registered — the intersection pi computes must be non-empty.
    expect(unregistered(allowed, base.customTools)).toEqual([]);
  }
  const plan = toolNamesForMode("plan", base.tools);
  expect(plan).not.toContain("suggest_actions");
  expect(plan).not.toContain("suggest_reusable");
});

test("pi registers every allowlisted custom tool with the host + sandbox gates open", async () => {
  // The closed-gate config above never builds the host-proxying tools, so it
  // cannot catch drift in `save_routine` / `save_learning` / `run_code` / the
  // integration tools. Re-import with every gate open and re-assert parity.
  const prior = {
    controlPlane: process.env.HOUSTON_CONTROL_PLANE_URL,
    sandboxToken: process.env.HOUSTON_SANDBOX_TOKEN,
    codeSandboxUrl: process.env.HOUSTON_CODE_SANDBOX_URL,
  };
  process.env.HOUSTON_CONTROL_PLANE_URL = "http://host.local";
  process.env.HOUSTON_SANDBOX_TOKEN = "sandbox-token";
  // Presence of a sandbox URL flips codeExecution to "remote" → run_code.
  process.env.HOUSTON_CODE_SANDBOX_URL = "http://sandbox.local";
  try {
    vi.resetModules();
    await import("./conversation-cache");
    const open = {
      tools: [...captured.tools],
      customTools: [...captured.customTools],
    };
    expect(unregistered(open.tools, open.customTools)).toEqual([]);
    // The gates really opened (else the assertion above would pass vacuously
    // against the closed-gate set).
    expect(open.tools).toEqual(
      expect.arrayContaining([
        "suggest_actions",
        "save_routine",
        "save_learning",
        "run_code",
        "integration_search",
        "integration_execute",
        "request_connection",
        "custom_integration_detect",
        "custom_integration_add",
        "request_credential",
      ]),
    );
  } finally {
    restoreEnv("HOUSTON_CONTROL_PLANE_URL", prior.controlPlane);
    restoreEnv("HOUSTON_SANDBOX_TOKEN", prior.sandboxToken);
    restoreEnv("HOUSTON_CODE_SANDBOX_URL", prior.codeSandboxUrl);
  }
});
