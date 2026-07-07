import { describe, expect, test } from "vitest";
import {
  buildToolSelection,
  PLAN_MODE_TOOL_NAMES,
  planToolNames,
} from "./tool-selection";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";

describe("buildToolSelection", () => {
  test("local mode keeps clamped file tools plus ask_user and bash", () => {
    const selection = buildToolSelection({
      codeExecution: "local",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "ask_user",
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
      "integration_search",
      "integration_execute",
      "request_connection",
    ]);
  });
});

describe("planToolNames", () => {
  const EXPECTED = ["read", "ls", "grep", "find", "ask_user"];

  test("keeps exactly the read-only subset from the local (bash) selection", () => {
    const local = buildToolSelection({
      codeExecution: "local",
      integrations: true,
    });
    // Local selection has edit/write/bash + all integration tools; plan strips
    // every writer/actor and keeps only read/ls/grep/find/ask_user.
    expect(planToolNames(local.toolNames)).toEqual(EXPECTED);
    for (const dropped of [
      "edit",
      "write",
      "bash",
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
