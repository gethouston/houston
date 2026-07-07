import { describe, expect, test } from "vitest";
import { buildToolSelection } from "./tool-selection";
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
      "propose_custom_integration",
      "propose_mcp_server",
    ]);
  });
});
