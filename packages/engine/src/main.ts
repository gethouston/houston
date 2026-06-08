import { config } from "./config";
import { registerHeadlessAnthropicProvider } from "./auth/anthropic-headless";
import { startServer } from "./transport/server";

// Swap Claude's loopback OAuth for the headless copy-paste flow when remote.
if (config.headless) registerHeadlessAnthropicProvider();

const server = startServer();

function shutdown(signal: string) {
  console.log(`\n[engine] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
