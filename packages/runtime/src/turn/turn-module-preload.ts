import {
  loadedClaudeSdk,
  preloadClaudeSdk,
} from "../backends/claude/sdk-loader";
import { preloadCustomIntegrationModules } from "./custom-integration-loader";

export async function preloadTurnModules(): Promise<void> {
  await Promise.all([
    loadedClaudeSdk(preloadClaudeSdk()),
    preloadCustomIntegrationModules(),
    import("@earendil-works/pi-coding-agent"),
    import("../backends/claude/backend"),
    import("../backends/claude/custom-tools"),
    import("../backends/claude/mcp-tool-adapter"),
    import("../backends/claude/mcp-tool-set"),
    import("../backends/claude/one-shot"),
    import("../backends/claude/title"),
    import("../backends/pi/backend"),
    import("../session/one-shot"),
    import("./execute-turn"),
    import("./server"),
    import("./turn-backend"),
    import("./turn-mission-title"),
    import("./turn-runtime"),
    import("./turn-session"),
    import("./turn-session-startup"),
    import("./turn-toolset"),
  ]);
}
