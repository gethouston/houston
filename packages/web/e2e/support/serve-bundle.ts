import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertBundleBuilt, type BundleName, STAMP_FILE } from "./serve-mode";

const [name, port] = process.argv.slice(2);
if ((name !== "shell" && name !== "sign-in") || !port) {
  console.error("usage: serve-bundle.ts <shell|sign-in> <port>");
  process.exit(2);
}
const dir = assertBundleBuilt(name as BundleName);
warnIfStale(dir);

const child = spawn(
  "vite",
  ["preview", "--outDir", dir, "--port", port, "--strictPort"],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  if (signal) process.exit(128 + (os.constants.signals[signal] ?? 0));
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  console.error("serve-bundle: failed to start vite preview:", err);
  process.exit(1);
});

function warnIfStale(bundleDir: string): void {
  let built: string;
  let head: string;
  try {
    built = readFileSync(path.join(bundleDir, STAMP_FILE), "utf8").trim();
    head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return;
  }
  if (built !== head) {
    console.warn(
      `serve-bundle: ${bundleDir} was built at ${built.slice(0, 9)}, HEAD is ${head.slice(0, 9)}. Rebuild with \`pnpm --filter houston-web e2e:build\`.`,
    );
  }
}
