import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatPanel,
  decodeAttachmentMessage,
  UserAttachmentMessage,
} from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useDraftStore, useDraftText, useDraftFiles } from "../../stores/drafts";
import { isActiveSessionStatus, useSessionStatus } from "../../stores/session-status";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import { tauriChat, tauriAttachments, tauriConfig, tauriProvider } from "../../lib/tauri";
import { openAgentHref } from "../../lib/open-href";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { useFileToolRenderer } from "../../hooks/use-file-tool-renderer";
import { useConnectedToolkits, useConnections } from "../../hooks/queries";
import {
  ComposioLinkCard,
  parseComposioToolkitFromHref,
} from "../composio-link-card";
import { analytics } from "../../lib/analytics";
import type { TabProps } from "../../lib/types";
import { HoustonThinkingIndicator } from "../shell/experience-card";
import { ChatModelSelector } from "../chat-model-selector";
import { Paperclip } from "lucide-react";
import { useChatDisplayLabels } from "../use-chat-display-labels";
import { getDefaultModel, PROVIDERS, validEffortOrDefault, type EffortLevel } from "../../lib/providers";
import type { ProviderError } from "@houston-ai/chat";
import { ProviderReconnectCard } from "../shell/provider-reconnect-card";
import { ProviderErrorCard } from "../shell/provider-error-card";
import { ToolRuntimeErrorCard } from "../shell/tool-runtime-error-card";
import { isToolRuntimeErrorMessage } from "../tool-runtime-feed";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./provider-auth-feed";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";

export default function ChatTab({ agent }: TabProps) {
  const { t } = useTranslation("chat");
  const queuedLabels = useQueuedMessageLabels();
  const attachmentLabels = useMemo(
    () => ({
      attachmentCount: (count: number) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const attachmentValidation = useAttachmentRejectionDialog();
  const { isSpecialTool, renderToolResult, renderTurnSummary } = useFileToolRenderer(agent.folderPath);
  // Free-form chat tab gets its own UUID-scoped session key per agent.
  // Must be stable across renders so streaming events land in the same bucket.
  const sessionKey = `chat-${agent.id}`;
  const agentPath = agent.folderPath;
  // Attachments scope: keyed by agent so they survive restarts and are
  // wiped only when the agent is deleted.
  const attachmentScope = `agent-${agent.id}`;
  const feedItems = useFeedStore((s) => s.items[agentPath]?.[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const clearFeed = useFeedStore((s) => s.clearFeed);
  const addToast = useUIStore((s) => s.addToast);
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const [isLoading, setIsLoading] = useState(false);
  const sessionStatus = useSessionStatus(agentPath, sessionKey);
  const isSessionActive = isActiveSessionStatus(sessionStatus);
  const composerText = useDraftText(sessionKey);
  const composerFiles = useDraftFiles(sessionKey);
  const setComposerText = useCallback(
    (text: string) => useDraftStore.getState().setDraftText(sessionKey, text),
    [sessionKey],
  );
  const setComposerFiles = useCallback(
    (files: File[]) => useDraftStore.getState().setDraftFiles(sessionKey, files),
    [sessionKey],
  );
  const sendingRef = useRef(false);
  const loadedRef = useRef<string | null>(null);

  // --- Model selector ---
  // Provider/model lives on the agent. The chat picker writes through to the
  // agent's `.houston/config/config.json` so the next session opens with the
  // user's last pick and no other ephemeral state is involved.
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  const [agentEffort, setAgentEffort] = useState<string | null>(null);
  useEffect(() => {
    tauriConfig.read(agentPath).then((cfg) => {
      setAgentProvider((cfg.provider as string) ?? null);
      setAgentModel((cfg.model as string) ?? null);
      setAgentEffort((cfg.effort as string) ?? null);
    }).catch(() => {});
  }, [agentPath]);

  // Effective = agent config > Anthropic default. Workspace-level defaults
  // were retired; existing values were migrated into agent configs at boot.
  const effectiveProvider = agentProvider ?? "anthropic";
  const effectiveModel = agentModel ?? getDefaultModel(effectiveProvider);
  // Effort is per-model; validate the stored value against the active model
  // (so e.g. a stored `max` falls back to the default on a model without it).
  const effectiveEffort = validEffortOrDefault(effectiveProvider, effectiveModel, agentEffort);
  const authSignalKey = useMemo(
    () => providerAuthSignalKey(feedItems ?? []),
    [feedItems],
  );
  const visibleFeedItems = useMemo(
    () => filterProviderAuthFeedItems(feedItems ?? []),
    [feedItems],
  );

  const handleModelSelect = useCallback(
    async (prov: string, mod: string) => {
      // Optimistic local update so the dropdown flips immediately; the engine
      // round-trip is the slow part and re-reading config to confirm would
      // add a flash of the previous label.
      setAgentProvider(prov);
      setAgentModel(mod);
      try {
        const cfg = await tauriConfig.read(agentPath);
        await tauriConfig.write(agentPath, {
          ...cfg,
          provider: prov as "anthropic" | "openai",
          model: mod,
        });
        // Keep the sticky default in sync so the next new agent inherits
        // whatever the user just settled on.
        await tauriProvider.setLastUsed(prov, mod);
      } catch (e) {
        // Roll back the optimistic update so the picker doesn't lie about
        // persisted state. Toast surfacing happens through the `call`
        // wrapper inside `tauriConfig.write` / `tauriProvider.setLastUsed`.
        console.error("[chat-tab] persist model selection failed:", e);
        try {
          const cfg = await tauriConfig.read(agentPath);
          setAgentProvider(cfg.provider ?? null);
          setAgentModel(cfg.model ?? null);
        } catch {
          setAgentProvider(null);
          setAgentModel(null);
        }
      }
    },
    [agentPath],
  );

  const handleEffortSelect = useCallback(
    async (effort: EffortLevel) => {
      // Optimistic flip; the engine reads `config.effort` at send time, so
      // persisting it is what makes the next turn honor the new level.
      setAgentEffort(effort);
      try {
        const cfg = await tauriConfig.read(agentPath);
        await tauriConfig.write(agentPath, { ...cfg, effort });
      } catch (e) {
        // tauriConfig.write surfaces its own toast via the `call` wrapper;
        // roll back the optimistic state so the picker doesn't lie.
        console.error("[chat-tab] persist effort selection failed:", e);
        try {
          const cfg = await tauriConfig.read(agentPath);
          setAgentEffort(cfg.effort ?? null);
        } catch {
          setAgentEffort(null);
        }
      }
    },
    [agentPath],
  );

  // Variant-aware model switcher fed to ProviderErrorCard.
  // - ModelUnavailable with `suggested_fallback`: stay in same provider,
  //   switch to the suggested model (e.g. preview-gated → GA fallback).
  // - RateLimited / QuotaExhausted / everything else: cycle to a
  //   different provider entirely (the current one is the bottleneck).
  // The result is the user always gets a meaningful "switch and retry"
  // action, not a button that does nothing.
  const handleSwitchModel = useCallback(
    (err: ProviderError) => {
      if (err.kind === "model_unavailable" && err.suggested_fallback) {
        handleModelSelect(err.provider, err.suggested_fallback);
        return;
      }
      const fallback =
        PROVIDERS.find((p) => p.id !== effectiveProvider) ?? PROVIDERS[0];
      if (fallback) {
        handleModelSelect(fallback.id, fallback.defaultModel);
      }
    },
    [effectiveProvider, handleModelSelect],
  );

  useEffect(() => {
    if (loadedRef.current === agent.id) return;
    loadedRef.current = agent.id;
    clearFeed(agentPath, sessionKey);
    tauriChat.loadHistory(agentPath, sessionKey).then((rows) => {
      if (rows.length > 0) setFeed(agentPath, sessionKey, rows as FeedItem[]);
    });
  }, [agent.id, sessionKey, agentPath, setFeed, clearFeed]);

  const handleStop = useCallback(() => {
    tauriChat.stop(agentPath, sessionKey).catch(console.error);
  }, [agentPath, sessionKey]);

  useEffect(() => {
    if (sessionStatus === "completed" || sessionStatus === "error") {
      setIsLoading(false);
    }
  }, [sessionStatus]);

  const handleOpenLink = useCallback(
    (url: string) => {
      openAgentHref(url, agentPath);
    },
    [agentPath],
  );

  // Connection state for inline Composio connect cards. Only query
  // when the user is signed in — otherwise the CLI call will fail.
  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );

  // Custom link renderer — intercepts Composio connect URLs tagged
  // with `#houston_toolkit=<slug>` and renders them as rich cards.
  // Returns undefined for non-Composio links so the chat falls back
  // to the default markdown button.
  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      const toolkit = parseComposioToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <ComposioLinkCard
          toolkit={toolkit}
          isConnected={connectedSet.has(toolkit)}
          onOpen={onOpen}
        />
      );
    },
    [connectedSet],
  );

  const sendNow = useCallback(
    async (text: string, files: File[]) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      let started = false;
      try {
        const paths = await tauriAttachments.save(attachmentScope, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(agentPath, prompt, sessionKey, {
          // Mirror the displayed dropdown (effectiveProvider), not just
          // chatProvider. Otherwise the dropdown can show Gemini while
          // the engine falls back to its own resolution chain and routes
          // to Anthropic.
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        started = true;
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: prompt });
        analytics.track("chat_message_sent");
        setComposerText("");
        setComposerFiles([]);
      } catch (err) {
        setIsLoading(false);
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
        throw err;
      } finally {
        if (!started) setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [agentPath, sessionKey, attachmentScope, pushFeedItem, setComposerText, setComposerFiles, effectiveProvider, effectiveModel, t],
  );
  const handleQueued = useCallback(() => {
    setComposerText("");
    setComposerFiles([]);
  }, [setComposerText, setComposerFiles]);
  const messageQueue = useSessionMessageQueue({
    agentPath,
    sessionKey,
    isActive: isLoading || isSessionActive,
    sendNow,
    onQueued: handleQueued,
  });

  return (
    <div className="h-full w-full flex flex-col">
      <ChatPanel
        sessionKey={sessionKey}
        feedItems={visibleFeedItems}
        isLoading={isLoading || isSessionActive}
        onSend={messageQueue.sendOrQueue}
        onStop={handleStop}
        onOpenLink={handleOpenLink}
        renderLink={renderLink}
        isSpecialTool={isSpecialTool}
        renderToolResult={renderToolResult}
        processLabels={processLabels}
        getThinkingMessage={getThinkingMessage}
        renderTurnSummary={renderTurnSummary}
        renderSystemMessage={(msg) => {
          if (msg.providerError) {
            return (
              <ProviderErrorCard
                error={msg.providerError}
                onRetry={() =>
                  messageQueue.sendOrQueue(t("toolRuntimeError.retryPrompt"), [])
                }
                onSwitchModel={() => handleSwitchModel(msg.providerError!)}
              />
            );
          }
          if (isToolRuntimeErrorMessage(msg)) {
            const isModelUnsupported =
              msg.runtimeError.kind === "provider_model_unsupported";
            return (
              <ToolRuntimeErrorCard
                error={msg.runtimeError}
                onRetry={() =>
                  messageQueue.sendOrQueue(t("toolRuntimeError.retryPrompt"), [])
                }
                onSwitchModel={
                  isModelUnsupported ? () => handleModelSelect("openai", "gpt-5.5") : undefined
                }
              />
            );
          }
          if (isProviderAuthMessage(msg.content)) {
            return null;
          }
          if (authSignalKey && msg.content.startsWith("Session error:")) {
            return null;
          }
          return undefined;
        }}
        renderUserMessage={(msg) => {
          const invocation = decodeAttachmentMessage(msg.content);
          if (!invocation) return undefined;
          return (
            <UserAttachmentMessage
              invocation={invocation}
              labels={attachmentLabels}
            />
          );
        }}
        afterMessages={
          <ProviderReconnectCard
            providerId={authSignalKey ? effectiveProvider : undefined}
            signalKey={authSignalKey ?? undefined}
          />
        }
        thinkingIndicator={<HoustonThinkingIndicator />}
        placeholder={t("composer.placeholder")}
        value={composerText}
        onValueChange={setComposerText}
        attachments={composerFiles}
        onAttachmentsChange={setComposerFiles}
        onNotice={handleNotice}
        composerLabels={{
          fileAlreadyInChat: t("composer.fileAlreadyInChat"),
          dropTitle: t("composer.dropTitle"),
          dropDescription: t("composer.dropDescription"),
          imagePasteUnavailable: t("composer.imagePasteUnavailable"),
        }}
        prepareAttachments={attachmentValidation.prepareAttachments}
        onAttachmentRejections={attachmentValidation.onAttachmentRejections}
        queuedMessages={messageQueue.queuedMessages}
        onRemoveQueuedMessage={messageQueue.removeQueuedMessage}
        queuedLabels={queuedLabels}
        footer={
          <ChatModelSelector
            provider={effectiveProvider}
            model={effectiveModel}
            onSelect={handleModelSelect}
            lockedProvider={visibleFeedItems.length > 0 ? effectiveProvider : null}
            effort={effectiveEffort}
            onEffortSelect={handleEffortSelect}
          />
        }
        attachMenu={({ openFilePicker }) => (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => {
                openFilePicker();
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Paperclip className="size-4 text-muted-foreground" />
              {t("composer.addFiles")}
            </button>
            <div className="px-2 py-1">
              <ChatModelSelector
                provider={effectiveProvider}
                model={effectiveModel}
                onSelect={handleModelSelect}
                lockedProvider={visibleFeedItems.length > 0 ? effectiveProvider : null}
                effort={effectiveEffort}
                onEffortSelect={handleEffortSelect}
              />
            </div>
          </div>
        )}
        emptyState={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      {attachmentValidation.dialog}
    </div>
  );
}
