import { describe, expect, test } from "vitest";
import {
  AUTO_MODE_EXCLUDED_TOOL_NAMES,
  autoToolNames,
  buildToolSelection,
  PLAN_MODE_TOOL_NAMES,
  planToolNames,
  toolNamesForMode,
  turnCodeExecutionMode,
} from "./tool-selection";
import { ASSISTANT_TOOL_NAMES } from "./tools/assistant";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";
import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
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
      SUGGEST_ACTIONS_TOOL_NAME,
      "bash",
      "browser",
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
      SUGGEST_ACTIONS_TOOL_NAME,
      "run_code",
      "browser",
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
      SUGGEST_ACTIONS_TOOL_NAME,
      "browser",
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
      SUGGEST_ACTIONS_TOOL_NAME,
      "request_provider_connection",
      "request_hands_on",
      "browser",
      "integration_search",
      "integration_execute",
      "request_connection",
      "custom_integration_detect",
      "custom_integration_add",
      "custom_integration_remove",
      "request_credential",
    ]);
  });

  test("save_routine is added when the host is reachable, off by default", () => {
    const off = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(off.toolNames).not.toContain("save_routine");

    const on = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
      saveRoutine: true,
    });
    expect(on.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
      SUGGEST_ACTIONS_TOOL_NAME,
      "save_routine",
      "browser",
    ]);
  });

  test("save_routine reaches execute and auto but never plan", () => {
    const on = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
      saveRoutine: true,
    });
    expect(toolNamesForMode("execute", on.toolNames)).toContain("save_routine");
    expect(toolNamesForMode("auto", on.toolNames)).toContain("save_routine");
    expect(toolNamesForMode("plan", on.toolNames)).not.toContain(
      "save_routine",
    );
  });

  test("save_learning is added when the host is reachable, off by default", () => {
    const off = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(off.toolNames).not.toContain("save_learning");

    const on = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
      saveLearning: true,
    });
    expect(on.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
      "suggest_reusable",
      SUGGEST_ACTIONS_TOOL_NAME,
      "save_learning",
      "browser",
    ]);
  });

  test("save_learning reaches execute and auto but never plan", () => {
    const on = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
      saveLearning: true,
    });
    expect(toolNamesForMode("execute", on.toolNames)).toContain(
      "save_learning",
    );
    expect(toolNamesForMode("auto", on.toolNames)).toContain("save_learning");
    expect(toolNamesForMode("plan", on.toolNames)).not.toContain(
      "save_learning",
    );
  });
});

describe("assistant family gating", () => {
  const base = {
    codeExecution: "disabled",
    integrations: false,
    personalAssistant: true,
  } as const;

  test("absent by default — a normal agent performs no account operations", () => {
    const off = buildToolSelection(base);
    for (const name of ASSISTANT_TOOL_NAMES) {
      expect(off.toolNames).not.toContain(name);
    }
    expect(buildToolSelection({ ...base, assistant: false }).toolNames).toEqual(
      off.toolNames,
    );
  });

  test("an ordinary agent never gets the family, catalog loaded or not", () => {
    for (const personalAssistant of [false, undefined]) {
      const agent = buildToolSelection({
        codeExecution: "local",
        integrations: true,
        assistant: true,
        ...(personalAssistant === undefined ? {} : { personalAssistant }),
      });
      for (const name of ASSISTANT_TOOL_NAMES) {
        expect(agent.toolNames).not.toContain(name);
      }
      expect(agent.toolNames).toContain("bash");
      expect(agent.toolNames).toContain("integration_execute");
    }
  });

  test("the flag adds exactly the tools of the family, and nothing else", () => {
    const on = buildToolSelection({ ...base, assistant: true });
    expect(on.toolNames).toEqual([
      "read",
      "write",
      "ask_user",
      SUGGEST_REUSABLE_TOOL_NAME,
      SUGGEST_ACTIONS_TOOL_NAME,
      ...ASSISTANT_TOOL_NAMES,
      "request_provider_connection",
      "request_hands_on",
      "request_connection",
      "request_credential",
    ]);
    expect(on.toolNames).toContain("houston_recall");
  });

  test("the family reaches execute and auto but never plan", () => {
    const on = buildToolSelection({ ...base, assistant: true });
    for (const name of ASSISTANT_TOOL_NAMES) {
      expect(toolNamesForMode("execute", on.toolNames)).toContain(name);
      expect(toolNamesForMode(undefined, on.toolNames)).toContain(name);
      expect(toolNamesForMode("auto", on.toolNames)).toContain(name);
      expect(toolNamesForMode("plan", on.toolNames)).not.toContain(name);
    }
  });
});

describe("planToolNames", () => {
  const EXPECTED = ["read", "ls", "grep", "find", "ask_user"];

  test("keeps exactly the read-only subset from the local (bash) selection", () => {
    const local = buildToolSelection({
      codeExecution: "local",
      integrations: true,
    });
    expect(planToolNames(local.toolNames)).toEqual(EXPECTED);
    for (const dropped of [
      "edit",
      "write",
      "bash",
      "browser",
      "integration_search",
      "integration_execute",
      "request_connection",
    ])
      expect(planToolNames(local.toolNames)).not.toContain(dropped);
  });

  test("drops run_code from the remote selection", () => {
    const remote = buildToolSelection({
      codeExecution: "remote",
      integrations: true,
    });
    expect(planToolNames(remote.toolNames)).toEqual(EXPECTED);
    expect(planToolNames(remote.toolNames)).not.toContain("run_code");
  });

  test("the disabled, integration-less selection already reduces to the subset", () => {
    const disabled = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(planToolNames(disabled.toolNames)).toEqual(EXPECTED);
  });

  test("the subset constant is exactly read/ls/grep/find/ask_user", () => {
    expect([...PLAN_MODE_TOOL_NAMES]).toEqual(EXPECTED);
  });
});

describe("autoToolNames", () => {
  test("drops exactly ask_user from the full local selection", () => {
    const local = buildToolSelection({
      codeExecution: "local",
      integrations: true,
    });
    expect(autoToolNames(local.toolNames)).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "suggest_reusable",
      SUGGEST_ACTIONS_TOOL_NAME,
      "request_provider_connection",
      "request_hands_on",
      "bash",
      "browser",
      "integration_search",
      "integration_execute",
      "request_connection",
      "custom_integration_detect",
      "custom_integration_add",
      "custom_integration_remove",
      "request_credential",
    ]);
    expect(autoToolNames(local.toolNames)).not.toContain("ask_user");
    for (const kept of ["edit", "write", "bash"])
      expect(autoToolNames(local.toolNames)).toContain(kept);
  });

  test("keeps run_code from the remote selection, drops ask_user", () => {
    const remote = buildToolSelection({
      codeExecution: "remote",
      integrations: true,
    });
    const names = autoToolNames(remote.toolNames);
    expect(names).toContain("run_code");
    expect(names).toContain("integration_search");
    expect(names).toContain("request_connection");
    expect(names).not.toContain("ask_user");
  });

  test("the disabled, integration-less selection just loses ask_user", () => {
    const disabled = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(autoToolNames(disabled.toolNames)).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "suggest_reusable",
      SUGGEST_ACTIONS_TOOL_NAME,
      "browser",
    ]);
  });

  test("the excluded set is exactly ask_user", () => {
    expect([...AUTO_MODE_EXCLUDED_TOOL_NAMES]).toEqual(["ask_user"]);
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

describe("turnCodeExecutionMode", () => {
  test("remote passes through regardless of single-use", () => {
    expect(turnCodeExecutionMode("remote", false)).toBe("remote");
    expect(turnCodeExecutionMode("remote", true)).toBe("remote");
  });

  test("local is honored only on a single-use worker", () => {
    expect(turnCodeExecutionMode("local", true)).toBe("local");
    expect(turnCodeExecutionMode("local", false)).toBe("disabled");
  });

  test("disabled stays disabled", () => {
    expect(turnCodeExecutionMode("disabled", true)).toBe("disabled");
    expect(turnCodeExecutionMode("disabled", false)).toBe("disabled");
  });
});

describe("the personal assistant's tool set", () => {
  const coordinator = () =>
    buildToolSelection({
      codeExecution: "local",
      integrations: true,
      saveRoutine: true,
      saveLearning: true,
      missions: true,
      assistant: true,
      personalAssistant: true,
    });

  test("is exactly the coordinator surface", () => {
    expect(coordinator().toolNames).toEqual([
      "read",
      "write",
      "ask_user",
      SUGGEST_REUSABLE_TOOL_NAME,
      SUGGEST_ACTIONS_TOOL_NAME,
      "save_learning",
      "start_mission",
      "list_missions",
      "read_mission",
      "update_mission_status",
      ...ASSISTANT_TOOL_NAMES,
      "request_provider_connection",
      "request_hands_on",
      "request_connection",
      "request_credential",
    ]);
  });

  test("carries nothing that could do the work itself", () => {
    const names = coordinator().toolNames;
    for (const banned of [
      "bash",
      "run_code",
      "edit",
      "ls",
      "grep",
      "find",
      "integration_search",
      "integration_execute",
      "save_routine",
    ]) {
      expect(names).not.toContain(banned);
    }
  });

  test("never runs code, even where the deployment offers it", () => {
    expect(
      buildToolSelection({
        codeExecution: "remote",
        integrations: true,
        personalAssistant: true,
      }).includeRunCode,
    ).toBe(false);
  });

  test("every other agent is untouched by the clamp", () => {
    const normal = buildToolSelection({
      codeExecution: "local",
      integrations: true,
      saveRoutine: true,
      saveLearning: true,
      missions: true,
      assistant: true,
    });
    expect(normal.toolNames).toContain("bash");
    expect(normal.toolNames).toEqual(
      buildToolSelection({
        codeExecution: "local",
        integrations: true,
        saveRoutine: true,
        saveLearning: true,
        missions: true,
        assistant: true,
        personalAssistant: false,
      }).toolNames,
    );
  });
});

test("coordinator without an assistant catalog cannot offer custom credential preflight", () => {
  const selected = buildToolSelection({
    codeExecution: "disabled",
    integrations: true,
    personalAssistant: true,
  });
  expect(selected.toolNames).not.toContain("request_credential");
  expect(selected.toolNames).toContain("request_connection");
  expect(selected.toolNames).toContain("request_provider_connection");
});

test("directory tools reach regular agents with missions, never the coordinator", () => {
  for (const personalAssistant of [false, undefined]) {
    const names = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
      missions: true,
      personalAssistant,
    }).toolNames;
    expect(names).toContain("list_agents");
    expect(names).toContain("read_agent");
    expect(toolNamesForMode("auto", names)).toContain("list_agents");
    expect(toolNamesForMode("plan", names)).not.toContain("list_agents");
  }
  const coordinator = buildToolSelection({
    codeExecution: "disabled",
    integrations: false,
    missions: true,
    personalAssistant: true,
  }).toolNames;
  expect(coordinator).not.toContain("list_agents");
  expect(coordinator).not.toContain("read_agent");
});

describe("browser gating", () => {
  const ordinary = buildToolSelection({
    codeExecution: "disabled",
    integrations: false,
  });

  test("an ordinary agent browses in execute and auto, never in plan", () => {
    expect(toolNamesForMode("execute", ordinary.toolNames)).toContain(
      "browser",
    );
    expect(toolNamesForMode("auto", ordinary.toolNames)).toContain("browser");
    expect(toolNamesForMode("plan", ordinary.toolNames)).not.toContain(
      "browser",
    );
  });

  test("the coordinator never browses, whatever the deployment grants", () => {
    const coordinator = buildToolSelection({
      codeExecution: "local",
      integrations: true,
      saveRoutine: true,
      missions: true,
      assistant: true,
      personalAssistant: true,
    });
    expect(coordinator.toolNames).not.toContain("browser");
  });
});
