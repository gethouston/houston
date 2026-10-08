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
  report(error: unknown): void;
  sequenceStore: {
    get(): Promise<string | null>;
    set(value: string): Promise<void>;
  };
}

export function createUpdateManager(
  config: {
    baseUrl: string;
    publicKey: string;
    channel: "production" | "preview";
    builtinVersion: string;
    builtinSequence: number;
  },
  ports: UpdatePorts,
) {
  let lastCheck = -Infinity;
  let running = false;
  let required = false;
  return async function check(force = false): Promise<void> {
    if (
      running ||
      (!force && (required || ports.now() - lastCheck < 30 * 60 * 1000))
    )
      return;
    running = true;
    lastCheck = ports.now();
    try {
      let response: Response;
      try {
        response = await ports.fetch(
          `${config.baseUrl.replace(/\/$/, "")}/${config.channel}/manifest.json`,
          { cache: "no-store" },
        );
      } catch (error) {
        if (error instanceof TypeError) return; // Fetch network failure; retry on a later resume.
        throw error;
      }
      if (!response.ok) {
        if (
          response.status >= 500 ||
          response.status === 408 ||
          response.status === 429
        )
          return;
        throw new Error(`OTA manifest HTTP ${response.status}`);
      }
      const manifest = await verifyManifest(
        await response.json(),
        config.baseUrl,
        config.publicKey,
      );
      if (manifest.channel !== config.channel)
        throw new Error("OTA manifest channel mismatch");
      const saved = await ports.sequenceStore.get();
      const highest = saved === null ? 0 : Number(saved);
      if (!Number.isSafeInteger(highest) || highest < 0)
        throw new Error("Invalid stored OTA sequence");
      if (manifest.sequence <= Math.max(highest, config.builtinSequence))
        return;
      if (manifest.bundle_sequence < config.builtinSequence) return;
      const nativeBuild = Number(await ports.nativeBuild());
      if (!Number.isSafeInteger(nativeBuild) || nativeBuild < 1)
        throw new Error("Invalid native build number");
      if (nativeBuild < manifest.required_native_build) {
        required = true;
        ports.onRequired(manifest);
        return;
      }
      required = false;
      if (nativeBuild < manifest.min_native_build) return;
      const current = (await ports.updater.current()).bundle;
      const version =
        current.id === "builtin" ? config.builtinVersion : current.version;
      if (version === manifest.version) {
        await ports.sequenceStore.set(String(manifest.sequence));
        return;
      }
      const bundle = await ports.updater.download({
        url: manifest.url,
        version: manifest.version,
        checksum: manifest.sha256,
      });
      await ports.updater.next({ id: bundle.id });
      await ports.sequenceStore.set(String(manifest.sequence));
    } catch (error) {
      if (!ports.isOnline() || isConnectivityFailure(error)) return;
      ports.report(error);
    } finally {
      running = false;
    }
  };
}

function isConnectivityFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /network|offline|timed out|connection|dns/i.test(error.message);
}
