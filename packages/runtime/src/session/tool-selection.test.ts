import { describe, expect, test } from "vitest";
import {
  AUTO_MODE_EXCLUDED_TOOL_NAMES,
  autoToolNames,
  buildToolSelection,
  PLAN_MODE_TOOL_NAMES,
  planToolNames,
  toolNamesForMode,
} from "./tool-selection";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { SUGGEST_REUSABLE_TOOL_NAME } from "./tools/suggest-reusable";

describe("buildToolSelection", () => {
  test("local mode keeps clamped file tools plus ask_user and bash", () => {
    const selection = buildToolSelection({
      codeExecution: "local",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
      "bash",
    ]);
    expect(selection.includeRunCode).toBe(false);
  });

  test("remote mode keeps clamped file tools plus ask_user and run_code", () => {
    const selection = buildToolSelection({
      codeExecution: "remote",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
      "run_code",
    ]);
    expect(selection.includeRunCode).toBe(true);
  });

  test("disabled mode exposes clamped file tools plus ask_user", () => {
    const selection = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
    ]);
    expect(selection.toolNames).not.toContain("bash");
    expect(selection.toolNames).not.toContain("run_code");
    expect(selection.includeRunCode).toBe(false);
  });

  test("ask_user is available in every mode, but request_connection is gated", () => {
    const off = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(off.toolNames).toContain("ask_user");
    expect(off.toolNames).not.toContain("request_connection");
  });

  test("integration tools compose with disabled code execution", () => {
    const selection = buildToolSelection({
      codeExecution: "disabled",
      integrations: true,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
      "integration_search",
      "integration_execute",
      "request_connection",
    ]);
  });
});

describe("planToolNames", () => {
  // The read-only core every plan turn keeps; bash joins it only where the
  // execute selection carried bash (codeExecution=local).
  const READ_ONLY = ["read", "ls", "grep", "find", "ask_user"];

  test("keeps the read-only subset PLUS bash from the local selection", () => {
    const local = buildToolSelection({
      codeExecution: "local",
      integrations: true,
    });
    // Local selection has edit/write/bash + all integration tools; plan strips
    // every writer/actor but keeps bash for live lookups (time, curl/wget).
    expect(planToolNames(local.toolNames)).toEqual([...READ_ONLY, "bash"]);
    for (const dropped of [
      "edit",
      "write",
      "integration_search",
      "integration_execute",
      "request_connection",
    ])
      expect(planToolNames(local.toolNames)).not.toContain(dropped);
  });

  test("drops run_code from the remote selection — no bash there to keep", () => {
    const remote = buildToolSelection({
      codeExecution: "remote",
      integrations: true,
    });
    expect(planToolNames(remote.toolNames)).toEqual(READ_ONLY);
    expect(planToolNames(remote.toolNames)).not.toContain("run_code");
    expect(planToolNames(remote.toolNames)).not.toContain("bash");
  });

  test("the disabled, integration-less selection reduces to the read-only core", () => {
    const disabled = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(planToolNames(disabled.toolNames)).toEqual(READ_ONLY);
  });

  test("the subset constant is exactly read/ls/grep/find/ask_user/bash", () => {
    expect([...PLAN_MODE_TOOL_NAMES]).toEqual([...READ_ONLY, "bash"]);
  });
});

describe("autoToolNames", () => {
  test("drops exactly ask_user + request_connection from the full local selection", () => {
    const local = buildToolSelection({
      codeExecution: "local",
      integrations: true,
    });
    // Auto keeps every read/write/exec/integration tool; it only removes the two
    // blocking tools. Order is preserved (filter, not reorder).
    expect(autoToolNames(local.toolNames)).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "suggest_reusable",
      "bash",
      "integration_search",
      "integration_execute",
    ]);
    for (const dropped of ["ask_user", "request_connection"])
      expect(autoToolNames(local.toolNames)).not.toContain(dropped);
    // …and it keeps the file WRITE tools + bash, unlike plan.
    for (const kept of ["edit", "write", "bash"])
      expect(autoToolNames(local.toolNames)).toContain(kept);
  });

  test("keeps run_code from the remote selection, drops the blocking tools", () => {
    const remote = buildToolSelection({
      codeExecution: "remote",
      integrations: true,
    });
    const names = autoToolNames(remote.toolNames);
    expect(names).toContain("run_code");
    expect(names).toContain("integration_search");
    expect(names).not.toContain("ask_user");
    expect(names).not.toContain("request_connection");
  });

  test("the disabled, integration-less selection just loses ask_user", () => {
    const disabled = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(autoToolNames(disabled.toolNames)).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "suggest_reusable",
    ]);
  });

  test("the excluded set is exactly ask_user + request_connection", () => {
    expect([...AUTO_MODE_EXCLUDED_TOOL_NAMES]).toEqual([
      "ask_user",
      "request_connection",
    ]);
  });
});

describe("toolNamesForMode dispatcher", () => {
  const local = buildToolSelection({
    codeExecution: "local",
    integrations: true,
  });

  test("plan → the read-only subset plus plan_ready", () => {
    expect(toolNamesForMode("plan", local.toolNames)).toEqual([
      ...planToolNames(local.toolNames),
      PLAN_READY_TOOL_NAME,
    ]);
  });

  test("auto → everything minus the blocking tools", () => {
    expect(toolNamesForMode("auto", local.toolNames)).toEqual(
      autoToolNames(local.toolNames),
    );
  });

  test("execute / absent → the full allowlist unchanged (a copy)", () => {
    expect(toolNamesForMode("execute", local.toolNames)).toEqual(
      local.toolNames,
    );
    expect(toolNamesForMode(undefined, local.toolNames)).toEqual(
      local.toolNames,
    );
  });

  // plan_ready is plan-mode-only: present iff plan, and stripped from
  // execute/auto EVEN WHEN the incoming set already carries it (the Claude
  // backend hands `toolNamesForMode` a built list that includes plan_ready).
  describe("plan_ready gating (strip-then-reinject)", () => {
    test("plan_ready is present iff the mode is plan", () => {
      expect(toolNamesForMode("plan", local.toolNames)).toContain(
        PLAN_READY_TOOL_NAME,
      );
      expect(toolNamesForMode("auto", local.toolNames)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
      expect(toolNamesForMode("execute", local.toolNames)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
      expect(toolNamesForMode(undefined, local.toolNames)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
    });

    test("plan_ready in the incoming set never survives execute/auto", () => {
      // The Claude case: `all` already includes plan_ready.
      const withPlanReady = [...local.toolNames, PLAN_READY_TOOL_NAME];
      expect(toolNamesForMode("execute", withPlanReady)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
      expect(toolNamesForMode(undefined, withPlanReady)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
      expect(toolNamesForMode("auto", withPlanReady)).not.toContain(
        PLAN_READY_TOOL_NAME,
      );
      // …and plan does not duplicate it (stripped first, re-added once).
      const plan = toolNamesForMode("plan", withPlanReady);
      expect(plan.filter((n) => n === PLAN_READY_TOOL_NAME)).toEqual([
        PLAN_READY_TOOL_NAME,
      ]);
    });

    test("execute passes everything else through unchanged (plan_ready aside)", () => {
      const withPlanReady = [...local.toolNames, PLAN_READY_TOOL_NAME];
      expect(toolNamesForMode("execute", withPlanReady)).toEqual(
        local.toolNames,
      );
    });
  });

  // suggest_reusable is the inverse of plan_ready: it must reach execute AND
  // auto (it never blocks the turn) but NEVER plan (plan is read-only planning,
  // not a finished task). It stays out of plan automatically — it is not in
  // PLAN_MODE_TOOL_NAMES — and stays in auto because it is not in
  // AUTO_MODE_EXCLUDED_TOOL_NAMES.
  describe("suggest_reusable gating", () => {
    const withSuggest = [...local.toolNames, SUGGEST_REUSABLE_TOOL_NAME];

    test("present in execute / absent (undefined) and auto, but never plan", () => {
      expect(toolNamesForMode("execute", withSuggest)).toContain(
        SUGGEST_REUSABLE_TOOL_NAME,
      );
      expect(toolNamesForMode(undefined, withSuggest)).toContain(
        SUGGEST_REUSABLE_TOOL_NAME,
      );
      expect(toolNamesForMode("auto", withSuggest)).toContain(
        SUGGEST_REUSABLE_TOOL_NAME,
      );
      expect(toolNamesForMode("plan", withSuggest)).not.toContain(
        SUGGEST_REUSABLE_TOOL_NAME,
      );
    });
  });
});
