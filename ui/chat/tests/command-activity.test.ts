import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { classifyCommand, commandActivityOf } from "../src/command-activity.ts";
import type { ToolEntry } from "../src/feed-to-messages.ts";

const bash = (command: unknown): ToolEntry =>
  ({ name: "bash", input: { command } }) as ToolEntry;

// HOU-1048: the header narrates "the agent is on the internet" / "the agent is
// running Python" off the raw command line — the runtime has no dedicated web
// tool, so curl/wget/python all arrive as bash (or run_code).
describe("classifyCommand", () => {
  it("classifies curl with a full URL as web and extracts the host", () => {
    deepStrictEqual(
      classifyCommand("curl -s https://api.github.com/repos/a/b"),
      { kind: "web", host: "api.github.com" },
    );
  });

  it("strips a leading www. from the host", () => {
    deepStrictEqual(classifyCommand("wget https://www.anakin.io/pricing"), {
      kind: "web",
      host: "anakin.io",
    });
  });

  it("finds a bare scheme-less domain after the client", () => {
    deepStrictEqual(classifyCommand("curl -sL api.stripe.com/v1/charges"), {
      kind: "web",
      host: "api.stripe.com",
    });
  });

  it("is web with no host when the target isn't recognizable", () => {
    deepStrictEqual(classifyCommand('curl -K "$config_file"'), {
      kind: "web",
      host: undefined,
    });
  });

  it("sees through env assignments, wrappers, and absolute paths", () => {
    deepStrictEqual(
      classifyCommand("TOKEN=abc sudo /usr/bin/curl https://x.dev/api"),
      { kind: "web", host: "x.dev" },
    );
  });

  it("classifies python / python3 / pip invocations as python", () => {
    deepStrictEqual(classifyCommand("python3 analyze.py data.csv"), {
      kind: "python",
    });
    deepStrictEqual(classifyCommand("pip install requests"), {
      kind: "python",
    });
  });

  it("keeps a URL argument to a python script a python activity", () => {
    deepStrictEqual(
      classifyCommand("python fetch.py https://example.com/feed"),
      { kind: "python" },
    );
  });

  it("prefers web when a fetch pipes into python", () => {
    deepStrictEqual(
      classifyCommand("curl -s https://api.foo.dev/data | python -"),
      { kind: "web", host: "api.foo.dev" },
    );
  });

  it("scans across && / ; / newline segments", () => {
    deepStrictEqual(classifyCommand("cd /tmp && python run.py"), {
      kind: "python",
    });
  });

  it("returns undefined for ordinary shell work", () => {
    strictEqual(classifyCommand("ls -la && git status"), undefined);
    // Only the leading executable counts: a mention isn't an invocation.
    strictEqual(
      classifyCommand("cat curl-notes.md python_tips.txt"),
      undefined,
    );
    strictEqual(classifyCommand(""), undefined);
  });
});

describe("commandActivityOf", () => {
  it("classifies both bash dialects and MCP-prefixed names", () => {
    deepStrictEqual(commandActivityOf(bash("curl https://a.io")), {
      kind: "web",
      host: "a.io",
    });
    deepStrictEqual(
      commandActivityOf({
        name: "Bash",
        input: { command: "python x.py" },
      } as ToolEntry),
      { kind: "python" },
    );
    deepStrictEqual(
      commandActivityOf({
        name: "mcp__houston__bash",
        input: { command: "wget https://b.io" },
      } as ToolEntry),
      { kind: "web", host: "b.io" },
    );
  });

  it("classifies run_code by language, and bash code by its command", () => {
    deepStrictEqual(
      commandActivityOf({
        name: "run_code",
        input: { language: "python", code: "print(1)" },
      } as ToolEntry),
      { kind: "python" },
    );
    deepStrictEqual(
      commandActivityOf({
        name: "run_code",
        input: { language: "bash", code: "curl https://api.z.dev" },
      } as ToolEntry),
      { kind: "web", host: "api.z.dev" },
    );
    strictEqual(
      commandActivityOf({
        name: "run_code",
        input: { language: "node", code: "fetch('https://a.io')" },
      } as ToolEntry),
      undefined,
    );
  });

  it("tolerates malformed / half-streamed input", () => {
    strictEqual(commandActivityOf({ name: "bash" } as ToolEntry), undefined);
    strictEqual(
      commandActivityOf({ name: "bash", input: null } as ToolEntry),
      undefined,
    );
    strictEqual(
      commandActivityOf({ name: "bash", input: "curl" } as ToolEntry),
      undefined,
    );
    strictEqual(commandActivityOf(bash(7)), undefined);
  });

  it("returns undefined for non-command tools", () => {
    strictEqual(
      commandActivityOf({
        name: "Read",
        input: { file_path: "/tmp/curl.md" },
      } as ToolEntry),
      undefined,
    );
  });
});
