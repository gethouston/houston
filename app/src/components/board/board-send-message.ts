import type { Activity } from "../../data/activity";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { perfSpans } from "../../lib/perf-spans";
import { showSendFailedToast } from "../../lib/send-error-toast";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import type { SendOverrides } from "./board-source";
import { rowSessionKey } from "./session-loading";

/**
 * Sending into an EXISTING conversation, lifted out of the React layer
 * (`use-agent-board-send.ts` keeps the `useCallback` wrapper). Two paths: park
 * the message in the warming queue while the agent's pod is still coming up, or
 * hand it to the wire.
 */
export interface SendBoardMessageDeps {
  /** The active agent's folder path. */
  path: string;
  agentId: string;
  /** The board rows behind this surface, used to resolve the attachment scope
   *  and the row a parked send must flip back to running. */
  rawItems: Activity[] | undefined;
  /** Model-facing context prepended to the outgoing prompt, hidden from chat. */
  promptContext?: string;
  /** Marks the session locally sent (or clears it when the send never reached
   *  a turn stream). */
  setSessionLoading: (sessionKey: string, loading: boolean) => void;
}

/** Send `text` + `files` into `sessionKey`'s conversation. */
export async function sendBoardMessage(
  deps: SendBoardMessageDeps,
  sessionKey: string,
  text: string,
  files: File[],
  overrides: SendOverrides,
): Promise<void> {
  const { path, agentId, rawItems, promptContext, setSessionLoading } = deps;
  const activity = (rawItems ?? []).find(
    (a) => rowSessionKey(a) === sessionKey,
  );
  // Activity status flip (→ "running") is owned by the engine; don't
  // pre-write from the UI.
  const scopeId = activity ? `activity-${activity.id}` : sessionKey;
  // A follow-up into a still-warming agent parks with the same queue the
  // first message used (HOU-693): rendered now, delivered on ready. A
  // held wire send would die with infrastructure timeouts or a reload.
  const queuedWarm = useAgentProvisioningStore
    .getState()
    .queueWarmingSend(agentId, {
      agentPath: path,
      sessionKey,
      text,
      // A builder also runs for a bare context send: the flush then
      // persists the clean `text` as the bubble (displayText), exactly
      // like the attachment case.
      buildPrompt:
        files.length > 0 || promptContext
          ? async () => {
              const saved =
                files.length > 0
                  ? await tauriAttachments.save(scopeId, files)
                  : [];
              return buildAttachmentPrompt(text, files, saved, promptContext);
            }
          : undefined,
      provider: overrides.providerOverride,
      model: overrides.modelOverride,
      mode: overrides.modeOverride,
      mentions: overrides.mentions,
    });
  if (queuedWarm) {
    // The parked message narrates itself: the trailing user bubble keeps
    // the standard in-flight indicator on until the flushed turn takes
    // over (HOU-713). If the conversation's row is still queued (the
    // welcome mission settled to needs_you), flip it back to running —
    // the mission IS in progress again.
    if (activity) {
      useAgentProvisioningStore
        .getState()
        .setQueuedRowStatus(agentId, activity.id, "running");
    }
    perfSpans.messageSent();
    analytics.track("chat_message_sent", {
      provider: overrides.providerOverride,
      model: overrides.modelOverride,
    });
    for (const f of files)
      analytics.track("file_attached", { file_kind: classifyFileKind(f) });
    return;
  }
  try {
    const paths = await tauriAttachments.save(scopeId, files);
    const prompt = buildAttachmentPrompt(text, files, paths, promptContext);
    await tauriChat.send(path, prompt, sessionKey, {
      providerOverride: overrides.providerOverride,
      modelOverride: overrides.modelOverride,
      modeOverride: overrides.modeOverride,
      mentions: overrides.mentions,
      // A context-prefixed prompt with no attachment marker would render
      // raw — persist the user's words as the bubble instead. (With
      // attachments the marker already carries them.)
      displayText: promptContext && files.length === 0 ? text : undefined,
      // If the conversation is mid-turn the adapter holds this send; the
      // queued bubble shows the user's words, not the built prompt.
      queuedPreview: {
        text,
        attachmentNames: files.map((f) => f.name),
      },
    });
    setSessionLoading(sessionKey, true);
    perfSpans.messageSent();
    analytics.track("chat_message_sent", {
      provider: overrides.providerOverride,
      model: overrides.modelOverride,
    });
    for (const f of files)
      analytics.track("file_attached", { file_kind: classifyFileKind(f) });
  } catch (err) {
    setSessionLoading(sessionKey, false);
    // The send failed BEFORE a turn stream existed — nothing wrote to the
    // VM, so surface it as a toast (no-silent-failures rule).
    showSendFailedToast(err);
    throw err;
  }
}
