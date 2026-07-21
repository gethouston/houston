import { useCallback, useEffect, useRef, useState } from "react";
import { classifySkillError } from "./skill-error-kinds";
import type { SkillPreviewState } from "./skill-preview-modal";
import type { CommunitySkill, CommunitySkillPreview } from "./types";

const EMPTY_PREVIEW: CommunitySkillPreview = {
  title: null,
  description: "",
  image: null,
  category: null,
  tags: [],
};

/**
 * Owns the marketplace detail modal's open skill and its on-demand preview
 * fetch. `openInfo` aborts any in-flight fetch, opens the modal, and — when an
 * `onPreview` fetcher is present — loads the skill's real SKILL.md description,
 * surfacing a failure as the visible error state rather than swallowing it (an
 * absent fetcher opens a lightweight "no description" modal so a row click is
 * never dead). `closeDetail` aborts + clears; when `active` goes false the open
 * detail is abandoned along with its in-flight fetch.
 */
export function useSkillPreview(
  active: boolean,
  onPreview?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<CommunitySkillPreview>,
): {
  detailSkill: CommunitySkill | null;
  preview: SkillPreviewState;
  openInfo: (skill: CommunitySkill) => void;
  closeDetail: () => void;
} {
  const [detailSkill, setDetailSkill] = useState<CommunitySkill | null>(null);
  const [preview, setPreview] = useState<SkillPreviewState>({
    status: "loading",
  });
  const previewAbortRef = useRef<AbortController | null>(null);

  const openInfo = useCallback(
    (skill: CommunitySkill) => {
      previewAbortRef.current?.abort();
      setDetailSkill(skill);
      if (!onPreview) {
        setPreview({ status: "loaded", preview: EMPTY_PREVIEW });
        return;
      }
      setPreview({ status: "loading" });
      const controller = new AbortController();
      previewAbortRef.current = controller;
      onPreview(skill, controller.signal)
        .then((p) => {
          if (controller.signal.aborted) return;
          setPreview({ status: "loaded", preview: p });
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (classifySkillError(err) === "aborted") return;
          setPreview({ status: "error" });
        });
    },
    [onPreview],
  );

  const closeDetail = useCallback(() => {
    previewAbortRef.current?.abort();
    setDetailSkill(null);
  }, []);

  // Leaving the section abandons any open detail + in-flight preview fetch.
  useEffect(() => {
    if (!active) closeDetail();
  }, [active, closeDetail]);

  return { detailSkill, preview, openInfo, closeDetail };
}
