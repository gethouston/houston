import type { Activity } from "../../data/activity";
import { analytics } from "../../lib/analytics";
import {
  buildAttachmentPrompt,
  joinModelContext,
  prepareAttachmentSend,
} from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { showSendFailedToast } from "../../lib/send-error-toast";
import { isTypedSend } from "../../lib/sent-for-person";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import type { SendOverrides } from "./board-source";
import { rowSessionKey } from "./session-loading";

export interface SendBoardMessageDeps {
  path: string;
  agentId: string;
  rawItems: Activity[] | undefined;
  promptContext?: string;
  setSessionLoading: (sessionKey: string, loading: boolean) => void;
}

export async function sendBoardMessage(
  deps: SendBoardMessageDeps,
  sessionKey: string,
  text: string,
  files: File[],
  overrides: SendOverrides,
  context?: string,
): Promise<void> {
  const { path, agentId, rawItems, setSessionLoading } = deps;
  const promptContext = joinModelContext(deps.promptContext, context);
  const activity = (rawItems ?? []).find(
    (a) => rowSessionKey(a) === sessionKey,
  );
  const scopeId = activity ? `activity-${activity.id}` : sessionKey;
  const queuedWarm = useAgentProvisioningStore
    .getState()
    .queueWarmingSend(agentId, {
      agentPath: path,
      sessionKey,
      text,
      prompt:
        files.length === 0 && promptContext
          ? buildAttachmentPrompt(text, files, [], promptContext)
          : undefined,
      buildPrompt:
        files.length > 0
          ? async () => {
              const saved =
                files.length > 0
                  ? await tauriAttachments.save(path, scopeId, files)
                  : [];
              return buildAttachmentPrompt(text, files, saved, promptContext);
            }
          : undefined,
      provider: overrides.providerOverride,
      model: overrides.modelOverride,
      effort: overrides.effortOverride,
      mode: overrides.modeOverride,
      mentions: overrides.mentions,
      grants: overrides.grants,
    });
  if (queuedWarm) {
    if (activity) {
      useAgentProvisioningStore
        .getState()
        .setQueuedRowStatus(agentId, activity.id, "running");
    }
    if (isTypedSend(overrides))
      analytics.track("chat_message_sent", {
        provider: overrides.providerOverride,
        model: overrides.modelOverride,
      });
    for (const f of files)
      analytics.track("file_attached", { file_kind: classifyFileKind(f) });
    return;
  }
  try {
    const { prompt, queuedPreview } = await prepareAttachmentSend(
      text,
      files,
      (picked) => tauriAttachments.save(path, scopeId, picked),
      promptContext,
    );
    await tauriChat.send(path, prompt, sessionKey, {
      providerOverride: overrides.providerOverride,
      modelOverride: overrides.modelOverride,
      effortOverride: overrides.effortOverride,
      modeOverride: overrides.modeOverride,
      mentions: overrides.mentions,
      grants: overrides.grants,
      displayText: promptContext && files.length === 0 ? text : undefined,
      queuedPreview,
    });
    setSessionLoading(sessionKey, true);
    if (isTypedSend(overrides))
      analytics.track("chat_message_sent", {
        provider: overrides.providerOverride,
        model: overrides.modelOverride,
      });
    for (const f of files)
      analytics.track("file_attached", { file_kind: classifyFileKind(f) });
  } catch (err) {
    setSessionLoading(sessionKey, false);
    showSendFailedToast(err);
    throw err;
  }
}
