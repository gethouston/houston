import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { AUTH_WEB_PORT, FAKE_FIREBASE_API_KEY, WEB_PORT } from "../config";
import { type BundleName, bundleDir, STAMP_FILE } from "./serve-mode";

interface BundleSpec {
  name: BundleName;
  port: number;
  firebaseApiKey: string;
}

const BUNDLES: readonly BundleSpec[] = [
  { name: "shell", port: WEB_PORT, firebaseApiKey: "" },
  {
    name: "sign-in",
    port: AUTH_WEB_PORT,
    firebaseApiKey: FAKE_FIREBASE_API_KEY,
  },
];

function build(spec: BundleSpec): Promise<void> {
  const outDir = bundleDir(spec.name);
  const args = [
    "build",
    "--mode",
    "development",
    "--minify",
    "false",
    "--sourcemap",
    "false",
    "--outDir",
    outDir,
    "--emptyOutDir",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("vite", args, {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        HOUSTON_E2E_WEB_PORT: String(spec.port),
        FIREBASE_API_KEY: spec.firebaseApiKey,
      },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`vite build (${spec.name}) exited with ${signal ?? code}`),
        );
    });
  });
}

function gitHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  await Promise.all(BUNDLES.map(build));
  const head = gitHead();
  if (head)
    for (const b of BUNDLES)
      writeFileSync(path.join(bundleDir(b.name), STAMP_FILE), `${head}\n`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `e2e bundles built in ${seconds}s: ${BUNDLES.map((b) => bundleDir(b.name)).join(", ")}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
