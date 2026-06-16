import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel, type FeedItem } from "@houston-ai/chat";
import { HoustonAvatar, cn, resolveAgentColor } from "@houston-ai/core";
import { useSkills } from "../../../hooks/queries";
import { tauriAgent } from "../../../lib/tauri";
import { logger } from "../../../lib/logger";
import { useFeedStore } from "../../../stores/feeds";
import {
  useSessionStatus,
  isActiveSessionStatus,
} from "../../../stores/session-status";
import { useChatDisplayLabels } from "../../use-chat-display-labels";
import {
  buildOnboardingSkillFile,
  ONBOARDING_SKILL_SLUG,
} from "../onboarding-skill";
import { SkillCard } from "../../skill-card";
import type { Agent } from "../../../lib/types";
import type { MissionMeta } from "../mission-frame";
import { MissionChatFrame } from "../mission-chat-frame";
import { MissionIntroModal } from "../mission-intro-modal";
import { MissionDoneScreen } from "../mission-done-screen";

interface FrameLabels {
  brandLabel: string;
  counterLabel: string;
  upNextLabel: string;
}

interface SkillMissionProps {
  meta: MissionMeta;
  frame: FrameLabels;
  agent: Agent;
  assistantColor: string;
  /** Activity session key carried over from the Try mission. */
  sessionKey: string;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * "Save this as a Skill" — onboarding mission 5. Intro modal explains
 * what a Skill is. The CTA dismisses the modal; a chip replaces the
 * composer; clicking the chip triggers an app-side write of
 * `.agents/skills/plan-my-working-day/SKILL.md` via
 * `tauriAgent.writeFile`. No LLM involvement — the file content is a
 * deterministic template from `onboarding-skill.ts`.
 *
 * Why app-side instead of agent-driven: every byte of the SKILL.md is
 * already known the moment the user clicks. Having the LLM transcribe
 * it cost ~20-30s of pure generation time during onboarding. The file
 * watcher emits `SkillsChanged` shortly after the atomic write, which
 * invalidates `useSkills`, surfaces the new skill, and flips the done
 * state. Total perceived latency: ~1s.
 *
 * The chat is still visible because the user sees the Try-mission
 * conversation above the chip — that history is the proof that the
 * Skill captures real work.
 */
export function SkillMission({
  meta,
  frame,
  agent,
  assistantColor,
  sessionKey,
  onContinue,
  onSkip,
}: SkillMissionProps) {
  const { t } = useTranslation(["setup", "chat"]);
  const agentPath = agent.folderPath;

  const feedItems = useFeedStore((s) => s.items[agentPath]?.[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatus = useSessionStatus(agentPath, sessionKey);
  const isActive = isActiveSessionStatus(sessionStatus);
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();

  const { data: skills } = useSkills(agentPath);

  /**
   * `introDismissed` flips when the user clicks the modal CTA. Until
   * then the composer is hidden (the user is reading the modal); after
   * dismissal a chip replaces the composer so the user can click it
   * themselves to save the skill. `pickedAny` then flips when the chip
   * is clicked, which fires the app-side write.
   */
  const [introDismissed, setIntroDismissed] = useState(false);
  const [pickedAny, setPickedAny] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Snapshot the skill count at first non-null load so any pre-existing
   * skills (none, in fresh onboarding, but defensive) don't immediately
   * satisfy `done`. We still also match by exact slug below so the done
   * screen has a guaranteed-correct skill to render.
   */
  const initialSkillCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialSkillCountRef.current !== null) return;
    if (skills === undefined) return;
    initialSkillCountRef.current = skills.length;
  }, [skills]);

  const newSkill = useMemo(() => {
    if (!skills) return null;
    return skills.find((s) => s.name === ONBOARDING_SKILL_SLUG) ?? null;
  }, [skills]);

  const skillCreated = useMemo(() => {
    const baseline = initialSkillCountRef.current;
    if (baseline === null || skills === undefined) return false;
    return skills.length > baseline || newSkill !== null;
  }, [skills, newSkill]);

  const done = skillCreated;

  /**
   * Chip handler. Builds the SKILL.md content from a deterministic
   * template + the user's connected toolkits, writes via
   * `tauriAgent.writeFile`, and pushes a synthetic confirmation into
   * the feed so the user sees something happen. Done state fires from
   * `useSkills` after the file-watcher invalidation.
   */
  const handlePick = useCallback(
    async (chipLabel: string) => {
      if (pickedAny) return;
      setPickedAny(true);

      // User-message bubble first, mirroring the regular chip-send path:
      // the user clicked the chip, so the chat should reflect that as
      // an outgoing message.
      pushFeedItem(agentPath, sessionKey, {
        feed_type: "user_message",
        data: chipLabel,
      });

      const today = new Date().toISOString().slice(0, 10);
      const file = buildOnboardingSkillFile({
        description: t("setup:tutorial.missions.skill.savedDescription"),
        today,
      });

      try {
        await tauriAgent.writeFile(
          agentPath,
          `.agents/skills/${ONBOARDING_SKILL_SLUG}/SKILL.md`,
          file,
        );
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "assistant_text",
          data: t("setup:tutorial.missions.skill.savedMessage", {
            slug: ONBOARDING_SKILL_SLUG,
          }),
        });
      } catch (e) {
        setPickedAny(false);
        setError(e instanceof Error ? e.message : String(e));
        logger.warn(`[skill] write failed: ${e}`);
      }
    },
    [agentPath, sessionKey, pickedAny, pushFeedItem, t],
  );

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const visibleFeed = (feedItems ?? []) as FeedItem[];

  if (done && newSkill) {
    return (
      <MissionDoneScreen
        brandLabel={frame.brandLabel}
        assistantName={agent.name}
        assistantColor={assistantColor}
        title={t("setup:tutorial.missions.skill.done.title")}
        subtitle={t("setup:tutorial.missions.skill.done.subtitle")}
        continueLabel={t("setup:tutorial.missions.skill.continueChip")}
        onContinue={onContinue}
        skipLabel={t("setup:tutorial.missions.skill.skip")}
        onSkip={onSkip}
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("setup:tutorial.missions.skill.done.savedLabel")}
          </p>
          <SkillCard
            image={newSkill.image ?? "spiral-calendar"}
            title={newSkill.name}
            description={newSkill.description}
            onClick={() => {}}
          />
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
        skipLabel={t("setup:tutorial.missions.skill.skip")}
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
                {t("setup:tutorial.missions.skill.title")}
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
              // Composer is read-only in this mission — the app, not the
              // user, drives the next message. `onSend` is a no-op and
              // the composerOverride below replaces the textarea
              // entirely once the modal closes.
              onSend={() => {}}
              isLoading={false}
              placeholder={t("setup:tutorial.missions.skill.placeholder")}
              processLabels={processLabels}
              getThinkingMessage={getThinkingMessage}
              composerOverride={
                introDismissed && !pickedAny ? (
                  <div className="flex flex-col items-center gap-2 pb-2 pt-1 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        void handlePick(
                          t("setup:tutorial.missions.skill.chip"),
                        )
                      }
                      disabled={pickedAny}
                      className={cn(
                        "h-10 rounded-full border border-black/15 bg-background px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {t("setup:tutorial.missions.skill.chip")}
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
          title: t("setup:tutorial.missions.skill.intro.title"),
        })}
        body={t("setup:tutorial.missions.skill.intro.body")}
        ctaLabel={t("setup:tutorial.missions.skill.intro.cta")}
        onCta={() => setIntroDismissed(true)}
      />
    </>
  );
}
