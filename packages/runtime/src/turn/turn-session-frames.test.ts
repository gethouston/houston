import type { WireEvent, WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { HarnessSession, ReplyBeat } from "../backends/types";
import { newInteractionHolder } from "../session/interaction";
import { collectTurnFrames, newTurnFrames } from "./turn-session-frames";

test("a pooled turn emits reply_complete when the reply ends on plain text", () => {
  const wire = new Set<(e: WireEvent) => void>();
  const starts = new Set<() => void>();
  const beats = new Set<(b: ReplyBeat) => void>();
  const session = {
    subscribe: (l: (e: WireEvent) => void) => {
      wire.add(l);
      return () => wire.delete(l);
    },
    subscribeAssistantMessageStart: (l: () => void) => {
      starts.add(l);
      return () => starts.delete(l);
    },
    subscribeReplyBeats: (l: (b: ReplyBeat) => void) => {
      beats.add(l);
      return () => beats.delete(l);
    },
  } as unknown as HarnessSession;
  const emitted: WireFrame[] = [];
  const unsub = collectTurnFrames(
    session,
    newTurnFrames(),
    newInteractionHolder(),
    undefined,
    (f) => emitted.push(f),
  );

  for (const l of starts) l();
  for (const l of wire) l({ type: "text", data: "All done." });
  for (const l of beats) l({ type: "answer_end" });
  for (const l of beats) l({ type: "answer_end" });
  unsub();
  for (const l of beats) l({ type: "answer_end" });

  expect(emitted).toEqual([
    { type: "text", data: "All done." },
    { type: "reply_complete", data: null },
  ]);
});
