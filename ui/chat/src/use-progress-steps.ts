import { useMemo } from "react";
import type { FeedItem } from "./types";

export type StepStatus = "pending" | "active" | "done";

export interface ProgressStep {
  title: string;
  status: StepStatus;
}

function isProgressInput(
  input: unknown,
): input is { steps: { title: string; status: string }[] } {
  if (!input || typeof input !== "object") return false;
  const obj = input as Record<string, unknown>;
  return Array.isArray(obj.steps);
}

function parseStatus(raw: string): StepStatus {
  if (raw === "done") return "done";
  if (raw === "active") return "active";
  return "pending";
}

export function useProgressSteps(feedItems: FeedItem[]): ProgressStep[] {
  return useMemo(() => {
    let latest: ProgressStep[] | null = null;

    for (const item of feedItems) {
      if (
        item.feed_type === "tool_call" &&
        item.data.name === "update_progress" &&
        isProgressInput(item.data.input)
      ) {
        latest = item.data.input.steps.map((s) => ({
          title: s.title,
          status: parseStatus(s.status),
        }));
      }
    }

    return latest ?? [];
  }, [feedItems]);
}
