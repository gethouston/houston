import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoutines, useSkills } from "../../../hooks/queries";
import { useSessionMessageQueue } from "../../../hooks/use-session-message-queue";
import { logger } from "../../../lib/logger";
import { tauriAgent, tauriChat } from "../../../lib/tauri";
import type { Agent } from "../../../lib/types";
import { useFeedStore } from "../../../stores/feeds";
import {
  isActiveSessionStatus,
  useSessionStatus,
} from "../../../stores/session-status";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import { useQueuedMessageLabels } from "../../use-queued-message-labels";
import { MissionChatFrame } from "../mission-chat-frame";
import { MissionDoneScreen } from "../mission-done-screen";
import type { MissionMeta } from "../mission-frame";
import { MissionIntroModal } from "../mission-intro-modal";
import { ONBOARDING_SKILL_SLUG } from "../onboarding-skill";
import {
  appendRoutineSection,
  stripRoutineSection,
} from "../routine-system-prompt";
import { stripTutorialSection } from "../tutorial-system-prompt";

/**
 * Parse the cron schedule the onboarding agent writes (`M H * * 1-5`) into
 * a zero-padded 24h `HH:MM` string. Returns null for anything that doesn't
 * match the expected shape — calling code falls back to displaying the
 * raw cron in that case, which is at least a recognizable expression for
 * power users.
 */
function formatCronTime(schedule: string): string | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h] = parts;
  const min = Number.parseInt(m, 10);
  const hr = Number.parseInt(h, 10);
  if (!Number.isFinite(min) || !Number.isFinite(hr)) return null;
  if (hr < 0 || hr > 23 || min < 0 || min > 59) return null;
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Magic word the agent emits to signal "routine saved, frontend may
 * advance". Same forgiving shape as the tutorial token in `try.tsx`: codex
 * sometimes wraps the marker in bold, escapes the underscore, or
 * pluralizes. The strip regex stays in lockstep so whatever lands gets
 * scrubbed from the visible bubble.
 */
const ROUTINE_END_RE = /\[\s*\\?ROUTINE[_\s\\]+COMPLETED?\s*\]/i;
const ROUTINE_END_STRIP_RE =
  /\*{0,2}\[\s*\\?ROUTINE[_\s\\]+COMPLETED?\s*\]\*{0,2}/gi;

interface FrameLabels {
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

interface RoutineMissionProps {
  meta: MissionMeta;
  frame: FrameLabels;
  agent: Agent;
  assistantColor: string;
  provider: string;
  model: string;
  /**
   * Activity session key the Try mission created. The chat carries over —
   * the day-plan report stays visible in the feed and the agent operates
   * on the same conversation context, so it doesn't need to re-read mail
   * or calendar to set up the routine.
   */
  sessionKey: string;
  /** Called when the user clicks the done-screen Continue CTA. */
  onContinue: () => void;
  /** Always-on escape hatch wired to the orchestrator. */
  onSkip: () => void;
}

/**
 * "Make it a routine" — the closing onboarding mission. The user lands here
 * after `[TUTORIAL_COMPLETE]` with the chat already populated by the
 * day-plan report. We append a CLAUDE.md directive that scopes the agent
 * to a tight three-turn flow (ask the time, confirm, write the routine),
 * lock the composer behind a single "Make it a routine" chip, then advance
 * to the workspace shell once the new routine lands on disk.
 *
 * Why we detect via `.houston/routines/routines.json` count and not solely
 * via the `[ROUTINE_COMPLETE]` token: codex / claude-code occasionally
 * drop the literal token. The routine file on disk is the truth — if a
 * routine got written, the user is done regardless of what the agent
 * mumbled afterward. The token is the secondary signal so the user sees
 * a clean closing message even on the model that does emit it.
 */
export function RoutineMission({
  meta,
  frame,
  agent,
  assistantColor,
  provider,
  model,
  sessionKey,
  onContinue,
  onSkip,
}: RoutineMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;

  const feedItems = useFeedStore((s) => s.items[agentPath]?.[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatus = useSessionStatus(agentPath, sessionKey);
  const isActive = isActiveSessionStatus(sessionStatus);
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();

  const { data: routines } = useRoutines(agentPath);
  const { data: skills } = useSkills(agentPath);

  const onboardingSkill = useMemo(() => {
    return skills?.find((s) => s.name === ONBOARDING_SKILL_SLUG) ?? null;
  }, [skills]);

  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  /**
   * `introDismissed` flips when the user clicks the modal CTA. The
   * chip-in-composer is gated on this; until then the modal owns the
   * screen. `pickedAny` then flips when the chip itself is clicked,
   * which is what actually sends the prompt to the agent.
   */
  const [introDismissed, setIntroDismissed] = useState(false);
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Append the routine directive to CLAUDE.md while mounted; strip on
  // unmount. Mirrors the Try mission's tutorial-section pattern: engine
  // reads the augmented CLAUDE.md at session start, so the directive
  // lives in the system context and never bleeds into a visible chat
  // bubble. The write is wrapped in a ref so `handlePick` can await it
  // before `tauriChat.send` fires — otherwise a fast click on a slow
  // disk (Windows + NTFS + AV scan) sends the user message before the
  // directive lands and the agent reverts to the base routine guidance
  // (asks for what / when / which integrations — wrong shape here).
  const routinePrepRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    const prep = (async () => {
      try {
        const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
        // Strip any leftover Try-tutorial section, then append the
        // routine section, in a single write. Try's unmount cleanup
        // also strips the tutorial asynchronously, so the writes could
        // race. Doing both ops here (and idempotently in Try's cleanup)
        // means the file converges to "routine-section present,
        // tutorial absent" no matter which write lands last. The Skill
        // mission no longer touches CLAUDE.md, so nothing else to clean.
        const updated = appendRoutineSection(stripTutorialSection(current));
        if (cancelled || updated === current) return;
        await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
      } catch (e) {
        logger.warn(`[routine] could not append routine section: ${e}`);
      }
    })();
    routinePrepRef.current = prep;
    return () => {
      cancelled = true;
      void (async () => {
        try {
          const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
          const stripped = stripRoutineSection(current);
          if (stripped === current) return;
          await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
        } catch (e) {
          logger.warn(`[routine] could not strip routine section: ${e}`);
        }
      })();
    };
  }, [agentPath]);

  // Snapshot the routine count at first non-null load so any pre-existing
  // routines (defensively — first-run onboarding will always be zero, but
  // routine creation could conceivably happen between mounts) don't
  // immediately satisfy the "done" condition.
  const initialRoutineCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialRoutineCountRef.current !== null) return;
    if (routines === undefined) return;
    initialRoutineCountRef.current = routines.length;
  }, [routines]);

  const routineCreated = useMemo(() => {
    const baseline = initialRoutineCountRef.current;
    if (baseline === null || routines === undefined) return false;
    return routines.length > baseline;
  }, [routines]);

  const tokenSeen = useMemo(() => {
    const items = feedItems ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.feed_type !== "assistant_text") continue;
      const data = item.data;
      if (typeof data === "string" && ROUTINE_END_RE.test(data)) return true;
    }
    return false;
  }, [feedItems]);

  const done = routineCreated || tokenSeen;

  // Stop the session once the user has crossed the finish line so the
  // agent doesn't keep streaming on a screen the user already considers
  // complete. Fire-and-forget — if stop fails we surface a log line
  // (no toast: the user is leaving the screen regardless).
  useEffect(() => {
    if (!done || !isActive) return;
    tauriChat.stop(agentPath, sessionKey).catch((e) => {
      logger.warn(`[routine] stop after done failed: ${e}`);
    });
  }, [done, isActive, agentPath, sessionKey]);

  const transformContent = useCallback((content: string) => {
    if (!ROUTINE_END_RE.test(content)) return { content };
    return { content: content.replace(ROUTINE_END_STRIP_RE, "").trim() };
  }, []);

  const sendNow = useCallback(
    async (text: string, _files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      pushFeedItem(agentPath, sessionKey, {
        feed_type: "user_message",
        data: trimmed,
      });
      try {
        await tauriChat.send(agentPath, trimmed, sessionKey, {
          providerOverride: provider,
          modelOverride: model,
          effortOverride: "medium",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agentPath, sessionKey, provider, model, pushFeedItem],
  );

  const messageQueue = useSessionMessageQueue({
    agentPath,
    sessionKey,
    isActive,
    sendNow,
  });
  const queuedLabels = useQueuedMessageLabels();

  const handleSend = useCallback(
    async (text: string, files: File[]) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setComposerText("");
      setComposerFiles([]);
      await messageQueue.sendOrQueue(trimmed, files);
    },
    [messageQueue],
  );

  const handleStop = useCallback(() => {
    tauriChat.stop(agentPath, sessionKey).catch(console.error);
  }, [agentPath, sessionKey]);

  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);
      // Wait for the routine-section append before firing the send so
      // the engine spawns the next turn against the augmented CLAUDE.md.
      await routinePrepRef.current;
      pushFeedItem(agentPath, sessionKey, {
        feed_type: "user_message",
        data: chipLabel,
      });
      try {
        await tauriChat.send(agentPath, chipLabel, sessionKey, {
          providerOverride: provider,
          modelOverride: model,
          effortOverride: "medium",
        });
      } catch (e) {
        setPickedAny(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [agentPath, sessionKey, provider, model, pickedAny, pushFeedItem],
  );

  /**
   * Always-on escape hatch. The model can wedge — Codex in particular
   * sometimes loops asking the user the same time question, or fails to
   * emit the completion token after writing the routine. The skip link
   * stops any in-flight session and hands off via the orchestrator's
   * `onSkip` (which goes straight to the workspace shell, NOT through
   * the celebratory summary screen). `useEffect` cleanup still strips
   * the routine section from CLAUDE.md.
   */
  const handleSkip = useCallback(() => {
    if (isActive) {
      tauriChat.stop(agentPath, sessionKey).catch(console.error);
    }
    onSkip();
  }, [agentPath, sessionKey, isActive, onSkip]);

  const visibleFeed = (feedItems ?? []) as FeedItem[];

  // The new routine the agent just wrote, identified by the prompt
  // template the skill-aware directive enforces (`Run the
  // \`plan-my-working-day\` skill.`). Falling back to "most recently
  // created" prevents the done screen from going blank if the agent
  // tweaks the prompt copy — the routines list is sorted by
  // created_at ascending in the engine, so the tail is the freshest.
  const newRoutine = useMemo(() => {
    if (!routines || routines.length === 0) return null;
    const skillBound = [...routines]
      .reverse()
      .find((r) => r.prompt?.includes(ONBOARDING_SKILL_SLUG));
    if (skillBound) return skillBound;
    return routines[routines.length - 1];
  }, [routines]);

  if (done && newRoutine) {
    const formattedTime = formatCronTime(newRoutine.schedule);
    return (
      <MissionDoneScreen
        brandLabel={frame.brandLabel}
        assistantName={agent.name}
        assistantColor={assistantColor}
        title={t("setup:tutorial.missions.routine.done.title")}
        subtitle={t("setup:tutorial.missions.routine.done.subtitle")}
        continueLabel={t("setup:tutorial.missions.routine.continueChip")}
        onContinue={onContinue}
        skipLabel={t("setup:tutorial.missions.routine.skip")}
        onSkip={onSkip}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-secondary/40 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("setup:tutorial.missions.routine.title")}
            </p>
            <p className="text-lg font-medium">{newRoutine.name}</p>
            {newRoutine.description && (
              <p className="text-sm text-muted-foreground">
                {newRoutine.description}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-background p-4">
            <p className="text-2xl font-normal">
              {formattedTime
                ? t("setup:tutorial.missions.routine.done.everyWeekdayAt", {
                    time: formattedTime,
                  })
                : newRoutine.schedule}
            </p>
            {onboardingSkill && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("setup:tutorial.missions.routine.done.runsSkill", {
                  skill: onboardingSkill.name,
                })}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("setup:tutorial.missions.routine.done.manualHint")}
          </p>
        </div>
      </MissionDoneScreen>
    );
  }

  return (
    <>
      <MissionChatFrame
        meta={meta}
        brandLabel={frame.brandLabel}
        counterLabel={frame.counterLabel}
        skipLabel={t("setup:tutorial.missions.routine.skip")}
        onSkip={handleSkip}
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-black/5 pb-4">
            <HoustonAvatar
              color={resolveAgentColor(assistantColor)}
              diameter={32}
              running={isActive}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-sm font-medium">{agent.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t("setup:tutorial.missions.routine.title")}
              </p>
            </div>
          </header>
          {error && (
            <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex min-h-0 flex-1 flex-col pt-4">
            <ChatPanel
              sessionKey={sessionKey}
              feedItems={visibleFeed}
              onSend={handleSend}
              onStop={isActive ? handleStop : undefined}
              isLoading={isActive}
              placeholder={t("setup:tutorial.missions.routine.placeholder")}
              processLabels={processLabels}
              getThinkingMessage={getThinkingMessage}
              transformContent={transformContent}
              value={composerText}
              onValueChange={setComposerText}
              attachments={composerFiles}
              onAttachmentsChange={setComposerFiles}
              queuedMessages={messageQueue.queuedMessages}
              onRemoveQueuedMessage={messageQueue.removeQueuedMessage}
              queuedLabels={queuedLabels}
              composerOverride={
                introDismissed && !pickedAny ? (
                  <div className="flex flex-col items-center gap-2 pb-2 pt-1 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        void handlePick(
                          t("setup:tutorial.missions.routine.chip"),
                        )
                      }
                      disabled={pickedAny}
                      className={cn(
                        "h-10 rounded-full border border-black/15 bg-background px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {t("setup:tutorial.missions.routine.chip")}
                    </button>
                  </div>
                ) : undefined
              }
            />
          </div>
        </div>
      </MissionChatFrame>
      <MissionIntroModal
        open={!introDismissed}
        header={t("setup:tutorial.missionLabel", {
          title: t("setup:tutorial.missions.routine.intro.title"),
        })}
        body={t("setup:tutorial.missions.routine.intro.body")}
        ctaLabel={t("setup:tutorial.missions.routine.intro.cta")}
        onCta={() => setIntroDismissed(true)}
      />
    </>
  );
}
