import { expect, test } from "vitest";
import { scrubbedBashEnv } from "./scrubbed-bash";

/**
 * bash is where a leaked environment becomes an exploit: one `echo` prints
 * whatever the runtime was started with. The env a bash child gets is therefore
 * built from an allowlist, never from `process.env` minus a few names — a
 * denylist is one new variable away from being wrong.
 */

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
  // A child cannot start on native Windows without these, and Windows env keys
  // vary in case — matching case-sensitively would strip them.
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
