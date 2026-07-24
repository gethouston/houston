import type { CredentialStore } from "../ports";
import { MemoryTurnBus, type TurnBus } from "./bus";

/**
 * CP-side device-code connect for cloudrun workspaces. Per-turn runtimes are
 * stateless, so the multi-request OAuth dance cannot live there — it lives
 * here, using pi's own OAuth login (the openai-codex provider's `auth.oauth`
 * flow: same client id, endpoints, and rotation semantics as the desktop
 * runtime; nothing reimplemented). The
 * credential lands DIRECTLY in the central store: no refresh token ever
 * touches an agent, which closes the connect-window left by the legacy
 * export/capture/scrub dance.
 *
 * Replica-safety: the poll loop runs on the replica that started the flow,
 * but every state transition is mirrored to the TurnBus — a status poll
 * landing on another replica reads the same state, and a second start() on
 * another replica returns the in-progress flow's device code instead of
 * racing a duplicate login.
 */

export type ConnectInfo = {
  kind: "device_code";
  verificationUri: string;
  userCode: string;
};
export type ConnectState = {
  status: "starting" | "awaiting_user" | "complete" | "error";
  info?: ConnectInfo;
  error?: string;
};

const PROVIDER = "openai-codex";
/** How long a flow's state survives on the bus (device codes expire well before). */
const STATE_TTL_SEC = 1_800;
const stateKey = (ws: string) => `connect:state:${ws}`;
const lockKey = (ws: string) => `connect:lock:${ws}`;

export class ConnectManager {
  /** Flows THIS replica is polling (fast path; the bus is the shared truth). */
  private active = new Map<string, ConnectState>();
  private readonly bus: TurnBus;

  constructor(
    private readonly credentials: CredentialStore,
    bus: TurnBus = new MemoryTurnBus(),
  ) {
    this.bus = bus;
  }

  async status(workspaceId: string): Promise<ConnectState | null> {
    const local = this.active.get(workspaceId);
    if (local) return local;
    const raw = await this.bus.get(stateKey(workspaceId));
    return raw ? (JSON.parse(raw) as ConnectState) : null;
  }

  /** Mirror a transition to the bus so every replica's status() agrees. */
  private async setState(
    workspaceId: string,
    state: ConnectState,
  ): Promise<void> {
    this.active.set(workspaceId, state);
    await this.bus.set(
      stateKey(workspaceId),
      JSON.stringify(state),
      STATE_TTL_SEC,
    );
  }

  /** Begin (or resume) a device-code connect for a workspace. */
  async start(workspaceId: string): Promise<ConnectInfo> {
    const existing = await this.status(workspaceId);
    if (
      existing &&
      (existing.status === "starting" || existing.status === "awaiting_user") &&
      existing.info
    ) {
      return existing.info;
    }

    // Cross-replica guard: exactly one replica owns the login poll loop. A
    // loser polls the shared state until the owner publishes the device code.
    if (!(await this.bus.setNx(lockKey(workspaceId), "1", STATE_TTL_SEC))) {
      for (let waited = 0; waited < 15_000; waited += 500) {
        await new Promise((r) => setTimeout(r, 500));
        const st = await this.status(workspaceId);
        if (st?.info) return st.info;
        if (st?.status === "error")
          throw new Error(st.error ?? "connect failed");
      }
      throw new Error("timed out waiting for the in-progress connect flow");
    }

    const state: ConnectState = { status: "starting" };
    await this.setState(workspaceId, state);

    // The provider's OWN OAuth flow, driven directly. Deliberately NOT
    // `ModelRuntime.login`: that wrapper needs a throwaway auth.json to
    // capture the credential from AND follows the store write with a NETWORK
    // catalog refresh (`refresh({allowNetwork: true})` whenever `PI_OFFLINE`
    // is unset) — on a stalled network a SUCCESSFUL device-code approval
    // would hold this workspace's connect lock (and the credential in a temp
    // file) indefinitely. The direct login returns the credential in-process,
    // so it lands ONLY in the central store — no file ever holds it.
    const { openaiCodexProvider } = await import(
      "@earendil-works/pi-ai/providers/openai-codex"
    );
    const oauth = openaiCodexProvider().auth.oauth;
    if (!oauth)
      throw new Error("pi-ai openai-codex provider exposes no OAuth flow");

    let resolveInfo!: (i: ConnectInfo) => void;
    const infoReady = new Promise<ConnectInfo>((r) => (resolveInfo = r));
    const mirror = (next: ConnectState) => {
      // Sync callbacks can't await; the local map is updated immediately and
      // the bus mirror failure is loud (another replica would serve stale
      // status, but THIS flow still completes).
      this.setState(workspaceId, next).catch((err: unknown) =>
        console.error(`[connect:${workspaceId}] state mirror failed:`, err),
      );
    };

    void oauth
      .login({
        prompt: async (p) => {
          // Headless: always the device-code path. The manual-code/text
          // prompts exist for other providers' flows and must never fire
          // here — failing loudly if they do.
          if (p.type === "select") return "device_code";
          throw new Error(
            `unexpected ${p.type} prompt during a device-code connect`,
          );
        },
        notify: (event) => {
          switch (event.type) {
            case "auth_url":
              // Codex is device-code only; a browser-redirect flow must
              // never start here — failing loudly if it does.
              state.status = "error";
              state.error =
                "unexpected browser-redirect flow during a device-code connect";
              mirror(state);
              return;
            case "device_code":
              state.info = {
                kind: "device_code",
                verificationUri: event.verificationUri,
                userCode: event.userCode,
              };
              state.status = "awaiting_user";
              mirror(state);
              resolveInfo(state.info);
              return;
            default:
              console.log(`[connect:${workspaceId}]`, event.message);
              return;
          }
        },
      })
      .then(async (c) => {
        if (!c.access || !c.refresh || typeof c.expires !== "number") {
          throw new Error("login completed but returned no usable credential");
        }
        const accountId =
          typeof c.accountId === "string" ? c.accountId : undefined;
        await this.credentials.put({
          workspaceId,
          provider: PROVIDER,
          accessToken: c.access,
          refreshToken: c.refresh,
          accountId,
          expiresAt: c.expires,
        });
        state.status = "complete";
        await this.setState(workspaceId, state);
        console.log(`[connect:${workspaceId}] credential captured centrally`);
      })
      .catch(async (e: unknown) => {
        state.status = "error";
        state.error = e instanceof Error ? e.message : String(e);
        await this.setState(workspaceId, state).catch((err: unknown) =>
          console.error(`[connect:${workspaceId}] state mirror failed:`, err),
        );
        console.error(`[connect:${workspaceId}] failed:`, state.error);
      })
      .finally(() => {
        this.bus
          .del(lockKey(workspaceId))
          .catch((err: unknown) =>
            console.error(`[connect:${workspaceId}] lock release failed:`, err),
          );
      });

    return Promise.race([
      infoReady,
      new Promise<ConnectInfo>((_, rej) =>
        setTimeout(
          () => rej(new Error("timed out starting the connect flow")),
          15_000,
        ),
      ),
    ]);
  }
}
