import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import {
  bashMemoryFenceOptions,
  makeScrubbedBashTool,
  scrubbedBashEnv,
} from "./scrubbed-bash";

test("no HOUSTON_ variable survives into a bash child", () => {
  const env = scrubbedBashEnv({
    PATH: "/usr/bin",
    HOUSTON_SANDBOX_TOKEN: "sandbox-secret",
    HOUSTON_CONTROL_PLANE_URL: "http://127.0.0.1:4318",
    HOUSTON_RUNTIME_TOKEN: "runtime-secret",
    HOUSTON_ASSISTANT_TOKEN: "gateway-secret",
    HOUSTON_ASSISTANT_ROLE: "coordinator",
    HOUSTON_CODE_SANDBOX_TOKEN: "code-secret",
    HOUSTON_POOL_WORKER_TOKEN: "pool-secret",
    HOUSTON_TURN_TOKEN: "turn-secret",
  });

  expect(env).toEqual({ PATH: "/usr/bin" });
  expect(Object.keys(env).some((key) => key.startsWith("HOUSTON_"))).toBe(
    false,
  );
});

test("an unrelated ambient credential is dropped too", () => {
  const env = scrubbedBashEnv({
    HOME: "/Users/someone",
    ANTHROPIC_API_KEY: "sk-live",
    AWS_SECRET_ACCESS_KEY: "aws-live",
    GITHUB_TOKEN: "gh-live",
    COMPOSIO_API_KEY: "composio-live",
  });

  expect(env).toEqual({ HOME: "/Users/someone" });
});

test("the non-secret process bootstrap survives, so commands still run", () => {
  const source = {
    PATH: "/usr/bin",
    HOME: "/Users/someone",
    SHELL: "/bin/zsh",
    USER: "someone",
    LANG: "en_US.UTF-8",
    TMPDIR: "/tmp",
    HTTPS_PROXY: "http://proxy.corp:3128",
    NODE_EXTRA_CA_CERTS: "/etc/ssl/corp.pem",
  };

  expect(scrubbedBashEnv(source)).toEqual(source);
});

test("Windows process vars survive whatever case they arrive in", () => {
  const env = scrubbedBashEnv({
    SystemRoot: "C:\\Windows",
    Path: "C:\\Windows\\System32",
    ComSpec: "C:\\Windows\\System32\\cmd.exe",
    LOCALAPPDATA: "C:\\Users\\someone\\AppData\\Local",
  });

  expect(env.SystemRoot).toBe("C:\\Windows");
  expect(env.Path).toBe("C:\\Windows\\System32");
  expect(env.ComSpec).toBe("C:\\Windows\\System32\\cmd.exe");
  expect(env.LOCALAPPDATA).toBe("C:\\Users\\someone\\AppData\\Local");
});

test("a variable with no value is left out rather than passed as undefined", () => {
  expect(scrubbedBashEnv({ PATH: undefined, HOME: "/h" })).toEqual({
    HOME: "/h",
  });
});

describe("the memory fence", () => {
  test("no cap adds no prefix, so the unfenced tool is unchanged", () => {
    expect(bashMemoryFenceOptions(null)).toEqual({});
  });

  test("a cap becomes the ulimit prefix pi runs ahead of the command", () => {
    expect(bashMemoryFenceOptions(768 * 1024 * 1024)).toEqual({
      commandPrefix: "ulimit -d 786432 2>/dev/null",
    });
  });

  test.skipIf(process.platform !== "linux")(
    "the shell that runs the command sees the cap",
    async () => {
      const ctx = {
        sessionManager: {
          getSessionId: () => "test-session",
          getSessionFile: () => undefined,
        },
      } as unknown as ExtensionToolContext;
      const fenced = makeScrubbedBashTool(process.cwd(), {
        memoryCapBytes: 768 * 1024 * 1024,
      });
      const out = await fenced.execute(
        "call-1",
        { command: "ulimit -d" },
        new AbortController().signal,
        undefined,
        ctx,
      );
      expect(out.content[0]).toMatchObject({
        text: expect.stringMatching(/^786432\b/),
      });

      const open = makeScrubbedBashTool(process.cwd(), {
        memoryCapBytes: null,
      });
      const unfenced = await open.execute(
        "call-2",
        { command: "ulimit -d" },
        new AbortController().signal,
        undefined,
        ctx,
      );
      expect(unfenced.content[0]).toMatchObject({
        text: expect.stringMatching(/^unlimited\b/),
      });
    },
  );
});

describe("the tool shell", () => {
  const ctx = {
    sessionManager: {
      getSessionId: () => "test-session",
      getSessionFile: () => undefined,
    },
  } as unknown as ExtensionToolContext;

  test.skipIf(process.platform === "win32")(
    "a configured tool shell runs the command, with the fence and scrubbed env",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tool-shell-"));
      try {
        const marker = join(dir, "ran");
        const wrapper = join(dir, "tool-shell");
        writeFileSync(
          wrapper,
          `#!/bin/bash\n[ "$1" = "-c" ] || exit 64\nprintf '%s' "$2" > '${marker}'\necho via-tool-shell\nexec /bin/bash -c "$2"\n`,
        );
        chmodSync(wrapper, 0o755);
        process.env.HOUSTON_TOOL_SHELL_TEST_SECRET = "must-not-leak";
        const tool = makeScrubbedBashTool(dir, {
          memoryCapBytes: 768 * 1024 * 1024,
          toolShell: wrapper,
        });
        const out = await tool.execute(
          "call-1",
          { command: 'echo "secret=[$HOUSTON_TOOL_SHELL_TEST_SECRET]"' },
          new AbortController().signal,
          undefined,
          ctx,
        );

        expect(out.content[0]).toMatchObject({
          text: expect.stringMatching(/^via-tool-shell\nsecret=\[\]\n/),
        });
        expect(readFileSync(marker, "utf8")).toBe(
          'ulimit -d 786432 2>/dev/null\necho "secret=[$HOUSTON_TOOL_SHELL_TEST_SECRET]"',
        );
      } finally {
        delete process.env.HOUSTON_TOOL_SHELL_TEST_SECRET;
        rmSync(dir, { recursive: true });
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "no tool shell runs the command in plain bash, as before",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tool-shell-"));
      try {
        const tool = makeScrubbedBashTool(dir, {
          memoryCapBytes: null,
          toolShell: null,
        });
        const out = await tool.execute(
          "call-2",
          { command: "echo plain" },
          new AbortController().signal,
          undefined,
          ctx,
        );
        expect(out.content[0]).toMatchObject({
          text: expect.stringMatching(/^plain\b/),
        });
        expect(existsSync(join(dir, "ran"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true });
      }
    },
  );
});
