import type { CredentialStore } from "../ports";
import { MemoryTurnBus, type TurnBus } from "./bus";

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
const STATE_TTL_SEC = 1_800;
const stateKey = (ws: string) => `connect:state:${ws}`;
const lockKey = (ws: string) => `connect:lock:${ws}`;

export class ConnectManager {
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

  async start(workspaceId: string): Promise<ConnectInfo> {
    const existing = await this.status(workspaceId);
    if (
      existing &&
      (existing.status === "starting" || existing.status === "awaiting_user") &&
      existing.info
    ) {
      return existing.info;
    }

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

    const { openaiCodexProvider } = await import(
      "@earendil-works/pi-ai/providers/openai-codex"
    );
    const oauth = openaiCodexProvider().auth.oauth;
    if (!oauth)
      throw new Error("pi-ai openai-codex provider exposes no OAuth flow");

    let resolveInfo!: (i: ConnectInfo) => void;
    const infoReady = new Promise<ConnectInfo>((r) => (resolveInfo = r));
    const mirror = (next: ConnectState) => {
      this.setState(workspaceId, next).catch((err: unknown) =>
        console.error(`[connect:${workspaceId}] state mirror failed:`, err),
      );
    };

    void oauth
      .login({
        signal: AbortSignal.timeout(STATE_TTL_SEC * 1000),
        prompt: async (p) => {
          if (p.type === "select") return "device_code";
          throw new Error(
            `unexpected ${p.type} prompt during a device-code connect`,
          );
        },
        notify: (event) => {
          switch (event.type) {
            case "auth_url":
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
