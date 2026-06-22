import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { config } from "../config";

/**
 * Single-user credential store, persisted to dataDir/auth.json (mode 0600).
 * AuthStorage.getApiKey() auto-refreshes OAuth tokens under a file lock, so all
 * agent sessions transparently use the current Claude subscription token.
 */
export const authStorage = AuthStorage.create(
  join(config.dataDir, "auth.json"),
);

export const modelRegistry = ModelRegistry.create(
  authStorage,
  join(config.dataDir, "models.json"),
);
