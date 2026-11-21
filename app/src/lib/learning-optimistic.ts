import type { Learning, LearningAuthor } from "../data/learnings";

export function newLearning(
  text: string,
  taughtBy: LearningAuthor | undefined,
  id: string,
  nowIso: string,
): Learning {
  return {
    id,
    text,
    created_at: nowIso,
    ...(taughtBy ? { taught_by: taughtBy } : {}),
  };
}

export function appendLearning(
  list: Learning[] | undefined,
  learning: Learning,
): Learning[] | undefined {
  if (!list) return list;
  if (list.some((entry) => entry.id === learning.id)) return list;
  return [...list, learning];
}

export function editLearning(
  list: Learning[] | undefined,
  id: string,
  text: string,
): Learning[] | undefined {
  if (!list) return list;
  return list.map((entry) =>
    entry.id === id && entry.text !== text ? { ...entry, text } : entry,
  );
}

export function dropLearning(
  list: Learning[] | undefined,
  id: string,
): Learning[] | undefined {
  if (!list?.some((entry) => entry.id === id)) return list;
  return list.filter((entry) => entry.id !== id);
}
