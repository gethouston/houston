import type { UpdateManifest } from "./manifest";
import { verifyManifest } from "./manifest";

export interface UpdaterPort {
  current(): Promise<{ bundle: { id: string; version: string } }>;
  download(options: {
    url: string;
    version: string;
    checksum: string;
  }): Promise<{ id: string }>;
  next(options: { id: string }): Promise<unknown>;
}

export interface UpdatePorts {
  fetch: typeof fetch;
  now(): number;
  updater: UpdaterPort;
  nativeBuild(): Promise<string>;
  isOnline(): boolean;
  onRequired(manifest: UpdateManifest): void;
  onCleared?(): void;
  report(error: unknown): void;
  sequenceStore: {
    get(): Promise<string | null>;
    set(value: string): Promise<void>;
  };
}

export type UpdateCheckResult = "required" | "clear" | "unavailable";

export function createUpdateManager(
  config: {
    baseUrl: string;
    publicKey: string;
    channel: "production" | "preview";
    builtinVersion: string;
    builtinSequence: number | ((nativeBuild: string) => number);
  },
  ports: UpdatePorts,
) {
  let lastCheck = -Infinity;
  let running: Promise<UpdateCheckResult> | null = null;
  let required = false;
  return function check(force = false): Promise<UpdateCheckResult> {
    if (running) return running;
    if (!force && (required || ports.now() - lastCheck < 30 * 60 * 1000))
      return Promise.resolve("unavailable");
    running = runCheck();
    return running;
  };

  async function runCheck(): Promise<UpdateCheckResult> {
    lastCheck = ports.now();
    try {
      let response: Response;
      try {
        response = await ports.fetch(
          `${config.baseUrl.replace(/\/$/, "")}/${config.channel}/manifest.json`,
          { cache: "no-store" },
        );
      } catch (error) {
        if (error instanceof TypeError) return "unavailable"; // Fetch network failure; retry on a later resume.
        throw error;
      }
      if (!response.ok) {
        if (
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429
        )
          return "unavailable";
        throw new Error(`OTA manifest HTTP ${response.status}`);
      }
      const manifest = await verifyManifest(
        await response.json(),
        config.baseUrl,
        config.publicKey,
      );
      if (manifest.channel !== config.channel)
        throw new Error("OTA manifest channel mismatch");
      let nativeBuildText: string;
      try {
        nativeBuildText = await ports.nativeBuild();
      } catch (error) {
        lastCheck = -Infinity;
        ports.report(error);
        return "unavailable";
      }
      const nativeBuild = Number(nativeBuildText);
      if (!Number.isSafeInteger(nativeBuild) || nativeBuild < 1)
        throw new Error("Invalid native build number");
      if (nativeBuild < manifest.required_native_build) {
        required = true;
        ports.onRequired(manifest);
        return "required";
      }
      if (required) ports.onCleared?.();
      required = false;
      const builtinSequence =
        typeof config.builtinSequence === "function"
          ? config.builtinSequence(nativeBuildText)
          : config.builtinSequence;
      const saved = await ports.sequenceStore.get();
      const highest = saved === null ? 0 : Number(saved);
      if (!Number.isSafeInteger(highest) || highest < 0)
        throw new Error("Invalid stored OTA sequence");
      if (manifest.sequence <= Math.max(highest, builtinSequence))
        return "clear";
      if (manifest.bundle_sequence < builtinSequence) return "clear";
      if (nativeBuild < manifest.min_native_build) return "clear";
      const current = (await ports.updater.current()).bundle;
      const version =
        current.id === "builtin" ? config.builtinVersion : current.version;
      if (version === manifest.version) {
        await ports.sequenceStore.set(String(manifest.sequence));
        return "clear";
      }
      const bundle = await ports.updater.download({
        url: manifest.url,
        version: manifest.version,
        checksum: manifest.sha256,
      });
      await ports.updater.next({ id: bundle.id });
      await ports.sequenceStore.set(String(manifest.sequence));
      return "clear";
    } catch (error) {
      lastCheck = -Infinity;
      if (!ports.isOnline() || isConnectivityFailure(error))
        return "unavailable";
      ports.report(error);
      return "unavailable";
    } finally {
      running = null;
    }
  }
}

function isConnectivityFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /network|offline|timed out|connection|dns/i.test(error.message);
}
