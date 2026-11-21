import type { IncomingMessage, ServerResponse } from "node:http";
import type { ClaudeOAuthCredential, CustomEndpoint } from "@houston/protocol";
import { normalizeTurnMode, ROUTINE_FIRE_HEADER } from "@houston/protocol";
import {
  type RevocationTombstones,
  RevokedRefillBlockedError,
  sharedRevocationTombstones,
} from "../credentials/revocation-tombstones";
import type { FireTurnOptions } from "../fire-turn-options";
import {
  ApiKeyRejectedError,
  type CaptureResult,
  type ChannelCtx,
  type CredentialStore,
  type ForwardRequest,
  type RuntimeChannel,
  type RuntimeEndpoint,
  type RuntimeLauncher,
  type TurnPin,
} from "../ports";
import { LOCAL_PLACEHOLDER_KEY, OPENAI_COMPATIBLE } from "../providers";
import { liveTurnPin, liveTurns } from "../routes/live-turn";
import { MAX_JSON_BYTES, readBody } from "../routes/read-body";
import { captureRuntimeCredential } from "./capture-credential";
import {
  errorCodeFrom,
  isDialFailure,
  TurnDeliveryUncertainError,
  TurnFireError,
} from "./fire-error";
import {
  type NextStepSuggestionsReader,
  stampNextStepSuggestions,
} from "./next-step-suggestions";
import { wakeForDispatch } from "./probe-wake";
import { stampTurnTimezone } from "./turn-timezone";

export interface RuntimeProxy {
  forward(
    endpoint: RuntimeEndpoint,
    request: ForwardRequest,
    res: ServerResponse,
  ): Promise<void>;
}

const STALE_SKEW_MS = 60_000;
const TURN_LOG_ATTACH_TIMEOUT_MS = 1_500;

export class ProxyChannel implements RuntimeChannel {
  constructor(
    private readonly opts: {
      launcher: RuntimeLauncher;
      proxy: RuntimeProxy;
      credentials: CredentialStore;
      forwardActingHeader: boolean;
      anthropicServedHere?: boolean;
      beforeTurn?: (agent: ChannelCtx["agent"]) => Promise<void>;
      nextStepSuggestions?: NextStepSuggestionsReader;
      timezone?: (workspaceId: string) => Promise<string | null>;
      turnLogCapture?: {
        capture(
          endpoint: RuntimeEndpoint,
          agentId: string,
          conversationId: string,
        ): Promise<void>;
        stopCapture(agentId: string, conversationId: string): void;
      };
      revocations?: RevocationTombstones;
    },
  ) {}

  private get revocations(): RevocationTombstones {
    return this.opts.revocations ?? sharedRevocationTombstones;
  }

  private async attachTurnLogCapture(
    endpoint: RuntimeEndpoint,
    agentId: string,
    conversationId: string,
  ): Promise<void> {
    const capture = this.opts.turnLogCapture;
    if (!capture) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(
          () => resolve("timeout"),
          TURN_LOG_ATTACH_TIMEOUT_MS,
        );
        timer.unref?.();
      });
      const result = await Promise.race([
        capture
          .capture(endpoint, agentId, conversationId)
          .then(() => "attached" as const),
        timeout,
      ]);
      if (result === "timeout") {
        console.debug(
          `[turnlog] standing capture attach timed out for ${conversationId}; proceeding unattached`,
        );
      }
    } catch (error) {
      console.debug(
        `[turnlog] standing capture attach failed for ${conversationId}; proceeding without turnlog`,
        error,
      );
      this.stopTurnLogCapture(agentId, conversationId);
    } finally {
      clearTimeout(timer);
    }
  }

  private stopTurnLogCapture(agentId: string, conversationId: string): void {
    try {
      this.opts.turnLogCapture?.stopCapture(agentId, conversationId);
    } catch (error) {
      console.debug(
        `[turnlog] standing capture teardown failed for ${conversationId}`,
        error,
      );
    }
  }

  async dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const endpoint = await wakeForDispatch(
      this.opts.launcher,
      ctx,
      method,
      rest,
      res,
    );
    if (!endpoint) return;

    let body = ctx.body;
    if (!body && method !== "GET" && method !== "HEAD") {
      body = await readBody(req, MAX_JSON_BYTES);
    }
    const turnStart = rest.match(/^conversations\/([^/]+)\/messages$/);
    let capturedConversationId: string | undefined;
    if (method === "POST" && turnStart) {
      if (body && this.opts.timezone && !this.opts.forwardActingHeader)
        body = stampTurnTimezone(
          body,
          await this.opts.timezone(ctx.agent.workspaceId),
        );
      if (body && this.opts.nextStepSuggestions)
        body = await stampNextStepSuggestions(
          body,
          this.opts.nextStepSuggestions,
        );
      try {
        const conversationId = decodeURIComponent(turnStart[1] ?? "");
        capturedConversationId = conversationId;
        await this.attachTurnLogCapture(endpoint, ctx.agent.id, conversationId);
      } catch (error) {
        console.debug("[turnlog] standing capture enqueue failed", error);
      }
      try {
        await this.opts.beforeTurn?.(ctx.agent);
      } catch (error) {
        if (capturedConversationId) {
          this.stopTurnLogCapture(ctx.agent.id, capturedConversationId);
        }
        throw error;
      }
    }
    const params = new URLSearchParams(url.search);
    params.delete("token");
    const qs = params.toString();

    const actingHeader = this.opts.forwardActingHeader
      ? req.headers["x-houston-acting-as"]
      : undefined;
    const actingAs = Array.isArray(actingHeader)
      ? actingHeader[0]
      : actingHeader;

    const lastEventHeader = req.headers["last-event-id"];
    const lastEventId = Array.isArray(lastEventHeader)
      ? lastEventHeader[0]
      : lastEventHeader;

    try {
      await this.opts.proxy.forward(
        endpoint,
        {
          method,
          path: `/${rest}`,
          search: qs ? `?${qs}` : "",
          contentType: req.headers["content-type"] ?? null,
          body,
          actingAs,
          lastEventId,
        },
        res,
      );
    } catch (error) {
      if (capturedConversationId) {
        this.stopTurnLogCapture(ctx.agent.id, capturedConversationId);
      }
      throw error;
    }
    if (
      capturedConversationId &&
      (res.statusCode < 200 || res.statusCode >= 300)
    ) {
      this.stopTurnLogCapture(ctx.agent.id, capturedConversationId);
    }
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    { actingUser, actingAs, limits, routine, nonce }: FireTurnOptions = {},
  ): Promise<void> {
    liveTurns.start(
      ctx.agent.id,
      conversationId,
      normalizeTurnMode(pin?.mode),
      { actingAs, actingUser, limits },
      liveTurnPin(pin),
    );
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    await this.opts.beforeTurn?.(ctx.agent);
    const suggestions = (await this.opts.nextStepSuggestions?.()) ?? true;
    const timezone = await this.opts.timezone?.(ctx.agent.workspaceId);
    await this.attachTurnLogCapture(endpoint, ctx.agent.id, conversationId);
    let res: Response;
    try {
      res = await fetch(
        `${endpoint.baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${endpoint.token}`,
            ...(actingAs
              ? { "x-houston-acting-as": actingAs }
              : actingUser
                ? { "x-houston-acting-user": actingUser }
                : {}),
            ...(routine ? { [ROUTINE_FIRE_HEADER]: "1" } : {}),
          },
          body: JSON.stringify({
            text,
            ...(nonce ? { nonce } : {}),
            ...(pin?.provider ? { provider: pin.provider } : {}),
            ...(pin?.model ? { model: pin.model } : {}),
            ...(pin?.effort ? { effort: pin.effort } : {}),
            ...(pin?.mode ? { mode: pin.mode } : {}),
            ...(suggestions ? {} : { nextStepSuggestions: false }),
            ...(timezone ? { timezone } : {}),
          }),
        },
      );
    } catch (error) {
      this.stopTurnLogCapture(ctx.agent.id, conversationId);
      throw isDialFailure(error)
        ? error
        : new TurnDeliveryUncertainError(
            error,
            this.opts.launcher.isClosed?.() ?? false,
          );
    }
    if (!res.ok) {
      this.stopTurnLogCapture(ctx.agent.id, conversationId);
      const body = await res.text().catch(() => "");
      throw new TurnFireError(
        `runtime ${res.status}: ${body}`,
        res.status,
        errorCodeFrom(body),
        TurnFireError.providerIn(body),
      );
    }
  }

  async cancelTurn(ctx: ChannelCtx, conversationId: string): Promise<boolean> {
    if ((await this.opts.launcher.status(ctx.agent.id)) !== "running")
      return false;
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/conversations/${encodeURIComponent(conversationId)}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${endpoint.token}` },
      },
    );
    if (!res.ok) {
      throw new Error(
        `runtime ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const body = (await res.json().catch((err: unknown) => {
      throw new Error(
        `runtime cancel: malformed response body: ${err instanceof Error ? err.message : String(err)}`,
      );
    })) as { cancelled?: boolean };
    return body.cancelled === true;
  }

  async busy(ctx: ChannelCtx): Promise<boolean> {
    if ((await this.opts.launcher.status(ctx.agent.id)) !== "running")
      return false;
    try {
      const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
      const res = await fetch(`${endpoint.baseUrl}/busy`, {
        headers: { Authorization: `Bearer ${endpoint.token}` },
      });
      if (!res.ok) return true;
      const body = (await res.json()) as { busy?: unknown };
      return typeof body.busy === "boolean" ? body.busy : true;
    } catch {
      return true;
    }
  }

  async loginPending(ctx: ChannelCtx): Promise<boolean> {
    if ((await this.opts.launcher.status(ctx.agent.id)) !== "running")
      return false;
    try {
      const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
      const res = await fetch(`${endpoint.baseUrl}/busy`, {
        headers: { Authorization: `Bearer ${endpoint.token}` },
      });
      if (!res.ok) return true;
      const body = (await res.json()) as { loginPending?: unknown };
      return body.loginPending !== undefined && body.loginPending !== false;
    } catch {
      return true;
    }
  }

  async runtimeStatus(ctx: ChannelCtx) {
    return this.opts.launcher.status(ctx.agent.id);
  }

  async withQuiesced<T>(ctx: ChannelCtx, fn: () => Promise<T>): Promise<T> {
    const release = this.opts.launcher.hold?.(ctx.agent.id) ?? (() => {});
    try {
      if ((await this.opts.launcher.status(ctx.agent.id)) !== "absent") {
        await this.opts.launcher.sleep(ctx.agent.id);
      }
      return await fn();
    } finally {
      release();
    }
  }

  async teardown(ctx: ChannelCtx): Promise<void> {
    await this.opts.launcher.destroy(ctx.agent.id, { dropVolume: true });
  }

  async captureCredential(
    ctx: ChannelCtx,
    provider?: string,
  ): Promise<CaptureResult> {
    const result = await captureRuntimeCredential({
      endpoint: await this.opts.launcher.ensureAwake(ctx.agent),
      credentials: this.opts.credentials,
      workspaceId: ctx.agent.workspaceId,
      provider,
      actingAs: ctx.actingAs,
      anthropicServedHere: this.opts.anthropicServedHere ?? true,
    });
    if (result.ok) {
      this.revocations.clear({
        workspaceId: ctx.agent.workspaceId,
        provider: result.provider,
        actingAs: ctx.actingAs,
      });
    }
    return result;
  }

  async forgetCredential(ctx: ChannelCtx, provider: string): Promise<void> {
    await this.opts.credentials.remove(ctx.agent.workspaceId, provider, {
      actingAs: ctx.actingAs,
    });
  }

  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
    providerEndpoint?: string,
  ): Promise<void> {
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/auth/${encodeURIComponent(provider)}/api-key`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${endpoint.token}`,
          ...(ctx.actingAs ? { "x-houston-acting-as": ctx.actingAs } : {}),
        },
        body: JSON.stringify({
          key: apiKey,
          ...(providerEndpoint ? { endpoint: providerEndpoint } : {}),
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => undefined)) as
        | { error?: string; reason?: string }
        | undefined;
      throw new ApiKeyRejectedError(
        body?.error ??
          `the agent runtime did not accept the key (${res.status}) — try connecting again`,
        body?.reason,
      );
    }
    try {
      await this.opts.credentials.put(
        {
          workspaceId: ctx.agent.workspaceId,
          provider,
          accessToken: apiKey,
          refreshToken: "",
          expiresAt: 0,
          kind: "api_key",
          ...(providerEndpoint ? { enterpriseUrl: providerEndpoint } : {}),
        },
        { actingAs: ctx.actingAs },
      );
    } catch (err) {
      await this.rollbackRuntimeApiKey(endpoint, provider, apiKey, ctx);
      throw err;
    }
    this.revocations.clear({
      workspaceId: ctx.agent.workspaceId,
      provider,
      actingAs: ctx.actingAs,
    });
  }

  private async rollbackRuntimeApiKey(
    endpoint: RuntimeEndpoint,
    provider: string,
    apiKey: string,
    ctx: ChannelCtx,
  ): Promise<void> {
    try {
      const res = await fetch(
        `${endpoint.baseUrl}/auth/${encodeURIComponent(provider)}/api-key`,
        {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${endpoint.token}`,
            ...(ctx.actingAs ? { "x-houston-acting-as": ctx.actingAs } : {}),
          },
          body: JSON.stringify({ key: apiKey }),
        },
      );
      if (!res.ok) throw new Error(`runtime ${res.status}`);
    } catch (err) {
      console.error(
        `[credential] could not roll the ${provider} key back out of the runtime after the central store rejected the connect — the runtime keeps an unmanifested key until the next connect or pod recycle:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  async saveClaudeOAuthCredential(
    ctx: ChannelCtx,
    cred: ClaudeOAuthCredential,
    opts?: { ifAbsent?: boolean },
  ): Promise<void> {
    if (opts?.ifAbsent) {
      if (
        this.revocations.active({
          workspaceId: ctx.agent.workspaceId,
          provider: "anthropic",
          actingAs: ctx.actingAs,
        })
      ) {
        console.warn(
          "[credential] refused an if_absent claude-oauth fill: the anthropic credential was just provider-revoked (tombstone active)",
        );
        throw new RevokedRefillBlockedError("anthropic");
      }
      const existing = await this.opts.credentials.get(
        ctx.agent.workspaceId,
        "anthropic",
        { actingAs: ctx.actingAs },
      );
      if (existing) return;
    } else if (cred.expiresAt && cred.expiresAt < Date.now() - STALE_SKEW_MS) {
      throw new Error(
        "This Claude credential's access token is already expired, so it can't be a fresh sign-in. Sign in to Claude again, or paste a setup token.",
      );
    }
    await this.opts.credentials.put(
      {
        workspaceId: ctx.agent.workspaceId,
        provider: "anthropic",
        kind: "oauth",
        accessToken: cred.accessToken,
        refreshToken: cred.refreshToken ?? "",
        expiresAt: cred.expiresAt ?? 0,
      },
      { ifAbsent: opts?.ifAbsent, actingAs: ctx.actingAs },
    );
    if (!opts?.ifAbsent) {
      this.revocations.clear({
        workspaceId: ctx.agent.workspaceId,
        provider: "anthropic",
        actingAs: ctx.actingAs,
      });
    }
    if (ctx.actingAs) {
      return;
    }
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/auth/anthropic/oauth-credential`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${endpoint.token}`,
          ...(ctx.actingAs ? { "x-houston-acting-as": ctx.actingAs } : {}),
        },
        body: JSON.stringify({ claudeAiOauth: cred }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `credential stored, but the agent runtime did not accept it (${res.status}) — try connecting again`,
      );
    }
  }

  async saveCustomEndpoint(
    ctx: ChannelCtx,
    endpoint: CustomEndpoint,
  ): Promise<void> {
    const rt = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(`${rt.baseUrl}/providers/openai-compatible`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${rt.token}`,
        ...(ctx.actingAs ? { "x-houston-acting-as": ctx.actingAs } : {}),
      },
      body: JSON.stringify(endpoint),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `the local model could not be connected (${res.status})${
          detail ? `: ${detail}` : ""
        }`,
      );
    }
    await this.opts.credentials.put(
      {
        workspaceId: ctx.agent.workspaceId,
        provider: OPENAI_COMPATIBLE,
        accessToken: endpoint.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key",
      },
      { actingAs: ctx.actingAs },
    );
  }
}
