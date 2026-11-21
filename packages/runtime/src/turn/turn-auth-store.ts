import { join } from "node:path";
import { readAuthFile, writeAuthFile } from "../auth/auth-file";

export function turnAuthStore(dataDir: string): {
  get: (provider: string) => ReturnType<typeof readAuthFile>[string];
  remove: (provider: string) => void;
} {
  const path = join(dataDir, "auth.json");
  return {
    get: (provider) => readAuthFile(path)[provider],
    remove: (provider) => {
      const creds = readAuthFile(path);
      if (!(provider in creds)) return;
      delete creds[provider];
      writeAuthFile(path, creds);
    },
  };
}
