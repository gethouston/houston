process.env.HOUSTON_SIDECAR_BINARY = process.execPath;

if (process.env.HOUSTON_SIDECAR_ROLE === "runtime") {
  await import("../../runtime/src/main.ts");
} else if (process.env.HOUSTON_SIDECAR_ROLE === "browser-probe") {
  const { runBrowserProbe } = await import(
    "../../runtime/src/session/tools/browser/probe.ts"
  );
  await runBrowserProbe();
  process.exit(0);
} else {
  await import("./local/main.ts");
}
