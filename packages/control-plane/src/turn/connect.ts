import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CredentialStore } from "../ports";

/**
 * CP-side device-code connect for cloudrun workspaces. Per-turn runtimes are
 * stateless, so the multi-request OAuth dance cannot live there — it lives
 * here, using pi's own AuthStorage.login (same client id, endpoints, and
 * rotation semantics as the desktop runtime; nothing reimplemented). The
 * credential lands DIRECTLY in the central store: no refresh token ever
 * touches an agent, which closes the connect-window left by the legacy
 * export/capture/scrub dance.
 *
 * Login state is in-memory (single-replica CP, like the relay).
 */

export type ConnectInfo = { kind: "device_code"; verificationUri: string; userCode: string };
export type ConnectState = {
  status: "starting" | "awaiting_user" | "complete" | "error";
  info?: ConnectInfo;
  error?: string;
};

const PROVIDER = "openai-codex";

type PiAuthEntry = {
  type: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
};

export class ConnectManager {
  private active = new Map<string, ConnectState>();

  constructor(private readonly credentials: CredentialStore) {}

  status(workspaceId: string): ConnectState | null {
    return this.active.get(workspaceId) ?? null;
  }

  /** Begin (or resume) a device-code connect for a workspace. */
  async start(workspaceId: string): Promise<ConnectInfo> {
    const existing = this.active.get(workspaceId);
    if (
      existing &&
      (existing.status === "starting" || existing.status === "awaiting_user") &&
      existing.info
    ) {
      return existing.info;
    }

    const state: ConnectState = { status: "starting" };
    this.active.set(workspaceId, state);

    // Throwaway auth.json: pi's login needs a file; we capture + delete it.
    const dir = mkdtempSync(join(tmpdir(), "houston-connect-"));
    const authPath = join(dir, "auth.json");
    const { AuthStorage } = await import("@earendil-works/pi-coding-agent");
    const storage = AuthStorage.create(authPath);

    let resolveInfo!: (i: ConnectInfo) => void;
    const infoReady = new Promise<ConnectInfo>((r) => (resolveInfo = r));

    void storage
      .login(PROVIDER, {
        // Codex is device-code only; the URL/paste callbacks exist for other
        // providers' flows and must never fire here — failing loudly if they do.
        onAuth: () => {
          state.status = "error";
          state.error = "unexpected browser-redirect flow during a device-code connect";
        },
        onPrompt: () =>
          Promise.reject(new Error("unexpected paste-code prompt during a device-code connect")),
        onDeviceCode: (info: { verificationUri: string; userCode: string }) => {
          state.info = {
            kind: "device_code",
            verificationUri: info.verificationUri,
            userCode: info.userCode,
          };
          state.status = "awaiting_user";
          resolveInfo(state.info);
        },
        onSelect: async () => "device_code", // headless: always the device-code path
        onProgress: (m: string) => console.log(`[connect:${workspaceId}]`, m),
      })
      .then(async () => {
        const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, PiAuthEntry>;
        const c = auth[PROVIDER];
        if (!c?.access || !c.refresh || typeof c.expires !== "number") {
          throw new Error("login completed but no usable credential was written");
        }
        await this.credentials.put({
          workspaceId,
          provider: PROVIDER,
          accessToken: c.access,
          refreshToken: c.refresh,
          accountId: c.accountId,
          expiresAt: c.expires,
        });
        state.status = "complete";
        console.log(`[connect:${workspaceId}] credential captured centrally`);
      })
      .catch((e: unknown) => {
        state.status = "error";
        state.error = e instanceof Error ? e.message : String(e);
        console.error(`[connect:${workspaceId}] failed:`, state.error);
      })
      .finally(() => {
        rmSync(dir, { recursive: true, force: true }); // the tokens live ONLY centrally
      });

    return Promise.race([
      infoReady,
      new Promise<ConnectInfo>((_, rej) =>
        setTimeout(() => rej(new Error("timed out starting the connect flow")), 15_000),
      ),
    ]);
  }
}
