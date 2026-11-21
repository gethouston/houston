import type { ToolCallRecord } from "@houston/protocol";
import { type ChatChannel, publish } from "./chat-channel";

export interface ScriptedToolCall {
  name: string;
  args: unknown;
  content?: string;
  isError?: boolean;
  mission?: { id: string; title: string; agent: string };
}

let nextToolCalls: ScriptedToolCall[] = [];

export function setNextToolCalls(calls: ScriptedToolCall[]): void {
  nextToolCalls = calls;
}

export function takeToolCalls(): ScriptedToolCall[] {
  const calls = nextToolCalls;
  nextToolCalls = [];
  return calls;
}

export async function streamToolCalls(
  ch: ChatChannel,
  turnId: string,
  calls: readonly ScriptedToolCall[],
  pause: () => Promise<unknown>,
  live: () => boolean,
): Promise<void> {
  for (const call of calls) {
    if (!live()) return;
    publish(ch, {
      type: "tool_start",
      data: { name: call.name, args: call.args },
      turnId,
    });
    await pause();
    if (!live()) return;
    publish(ch, {
      type: "tool_end",
      data: {
        name: call.name,
        isError: call.isError ?? false,
        ...(call.content !== undefined ? { content: call.content } : {}),
        ...(call.mission ? { mission: call.mission } : {}),
      },
      turnId,
    });
    await pause();
  }
}

export function toolRecords(
  calls: readonly ScriptedToolCall[],
): ToolCallRecord[] {
  return calls.map((call) => ({
    name: call.name,
    input: call.args,
    ...(call.content !== undefined ? { result: call.content } : {}),
    ...(call.isError ? { isError: true } : {}),
    ...(call.mission ? { mission: call.mission } : {}),
  }));
}
