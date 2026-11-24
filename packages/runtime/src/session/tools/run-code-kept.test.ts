import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import type { KeepsWrite } from "./fs-guard-protected";
import { makeRunCodeTool } from "./run-code";
import { RunCodeLimiter } from "./run-code-limiter";

const artifact = (path: string, text: string) => ({
  path,
  contentBase64: Buffer.from(text).toString("base64"),
});

async function run(keepsWrite: KeepsWrite | undefined) {
  const ws = await mkdtemp(join(tmpdir(), "run-code-kept-"));
  const tool = makeRunCodeTool({
    workspaceDir: ws,
    limiter: new RunCodeLimiter({ maxConcurrent: 1, maxPerMinute: 10 }),
    ...(keepsWrite ? { keepsWrite } : {}),
    transport: async () =>
      Response.json({
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: false,
        truncated: false,
        artifacts: [
          artifact(".houston/config/config.json", "{}"),
          artifact(".houston/agent.json", "{}"),
          artifact(".houston/state.json", "{}"),
        ],
      }),
  });
  const result = await tool.execute(
    "kept",
    { language: "python", code: "x" },
    undefined,
    undefined,
    {} as unknown as ExtensionToolContext,
  );
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  return { ws, text };
}

test("a pooled turn's run_code refuses the files its sync would drop", async () => {
  const { ws, text } = await run((rel) => rel === ".houston/state.json");
  expect(existsSync(join(ws, ".houston", "config", "config.json"))).toBe(false);
  expect(existsSync(join(ws, ".houston", "agent.json"))).toBe(false);
  expect(await readFile(join(ws, ".houston", "state.json"), "utf8")).toBe("{}");
  expect(text).toContain("Your settings");
  expect(text).toContain(".houston/agent.json");
});

test("a standing runtime's run_code saves every file", async () => {
  const { ws } = await run(undefined);
  expect(existsSync(join(ws, ".houston", "config", "config.json"))).toBe(true);
  expect(existsSync(join(ws, ".houston", "agent.json"))).toBe(true);
});
