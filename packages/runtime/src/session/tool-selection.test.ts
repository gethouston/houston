import { describe, expect, test } from "vitest";
import { buildToolSelection } from "./tool-selection";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";

describe("buildToolSelection", () => {
  test("local mode keeps clamped file tools plus bash", () => {
    const selection = buildToolSelection({
      codeExecution: "local",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([...CLAMPED_FILE_TOOL_NAMES, "bash"]);
    expect(selection.includeRunCode).toBe(false);
  });

  test("remote mode keeps clamped file tools plus run_code", () => {
    const selection = buildToolSelection({
      codeExecution: "remote",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "run_code",
    ]);
    expect(selection.includeRunCode).toBe(true);
  });

  test("disabled mode exposes only clamped file tools", () => {
    const selection = buildToolSelection({
      codeExecution: "disabled",
      integrations: false,
    });
    expect(selection.toolNames).toEqual([...CLAMPED_FILE_TOOL_NAMES]);
    expect(selection.toolNames).not.toContain("bash");
    expect(selection.toolNames).not.toContain("run_code");
    expect(selection.includeRunCode).toBe(false);
  });

  test("integration tools compose with disabled code execution", () => {
    const selection = buildToolSelection({
      codeExecution: "disabled",
      integrations: true,
    });
    expect(selection.toolNames).toEqual([
      ...CLAMPED_FILE_TOOL_NAMES,
      "integration_search",
      "integration_execute",
    ]);
  });
});
