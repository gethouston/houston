import "./config";
import { startServer } from "./transport/server";

const server = startServer();

function shutdown(signal: string) {
  console.log(`\n[runtime] ${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
