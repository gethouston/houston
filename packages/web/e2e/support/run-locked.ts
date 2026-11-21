import { spawn } from "node:child_process";
import { acquireSuiteLock, releaseSuiteLock } from "./machine-lock";

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error("run-locked: no command given");
    process.exit(2);
  }

  await acquireSuiteLock();

  const child = spawn(cmd, args, { stdio: "inherit" });
  const forward = (signal: NodeJS.Signals) =>
    process.on(signal, () => child.kill(signal));
  forward("SIGINT");
  forward("SIGTERM");

  child.on("exit", (code, signal) => {
    releaseSuiteLock();
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  child.on("error", (err) => {
    releaseSuiteLock();
    console.error(`run-locked: failed to start ${cmd}:`, err);
    process.exit(1);
  });
}

void main();
