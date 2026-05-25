/**
 * Wires the library-pure `<AskUserQuestionCard>` from `@houston-ai/chat` into
 * Houston's app shell. The card itself knows nothing about the engine; this
 * hook supplies the missing pieces:
 *
 * - `onSubmit` → `engineClient.submitUserInput(agentPath, sessionKey, …)`,
 *   which POSTs to `/v1/agents/.../sessions/.../user_input`. The engine's
 *   blocked MCP handler then delivers the answer to the agent as the
 *   tool_result, and the agent's turn continues.
 * - `labels` from `t()` so the card respects en/es/pt locales.
 * - read-only "answered" view when the card is rendered against an already
 *   resulted tool_call (history reload, or just after submit).
 *
 * Returned in the same shape as `useFileToolRenderer` so chat-tab can compose
 * both — see `compose-special-tool-renderers.ts`.
 */

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AskUserQuestionCard,
  type AskUserQuestion,
  type AskUserQuestionAnswer,
  type ToolEntry,
} from "@houston-ai/chat";
import { getEngine } from "../lib/engine";

const ASK_USER_TOOL_NAME = "mcp__houston__AskUserQuestion";

/**
 * Extract the questions array from a tool_call's input payload. The MCP
 * server's JSON schema makes this `{ questions: [...] }`, but parser-emitted
 * tool_call rows can also arrive with `input: null` for the block_start
 * placeholder before the full input streams in. Return an empty array
 * in that case so the card renders a loading shell rather than crashing.
 */
function readQuestions(input: unknown): AskUserQuestion[] {
  if (!input || typeof input !== "object") return [];
  const candidate = (input as { questions?: unknown }).questions;
  if (!Array.isArray(candidate)) return [];
  return candidate as AskUserQuestion[];
}

/**
 * Best-effort parse of the persisted tool_result content into the typed
 * answer shape. The engine writes the JSON the frontend POSTed verbatim,
 * so this normally round-trips cleanly. Returns `undefined` if the content
 * isn't recognizable answer JSON (e.g. legacy text-only results, or the
 * "timeout" error string from a pre-SSE engine build).
 */
function readAnswered(result: ToolEntry["result"]): AskUserQuestionAnswer | undefined {
  if (!result || result.is_error) return undefined;
  try {
    const parsed = JSON.parse(result.content) as unknown;
    if (parsed && typeof parsed === "object" && "answers" in parsed) {
      const answers = (parsed as { answers?: unknown }).answers;
      if (Array.isArray(answers)) {
        return parsed as AskUserQuestionAnswer;
      }
    }
  } catch {
    // Result wasn't JSON — fall through.
  }
  return undefined;
}

export function useAskUserQuestionRenderer(agentPath: string, sessionKey: string) {
  // i18n keys live under the `chat` namespace alongside the rest of the
  // chat-tab strings — see `app/src/locales/en/chat.json`.
  const { t } = useTranslation("chat");

  const labels = useMemo(
    () => ({
      submit: t("askUserQuestion.submit"),
      submitting: t("askUserQuestion.submitting"),
      other: t("askUserQuestion.other"),
      otherPlaceholder: t("askUserQuestion.otherPlaceholder"),
      selectOne: t("askUserQuestion.selectOne"),
      selectMany: t("askUserQuestion.selectMany"),
      answered: t("askUserQuestion.answered"),
    }),
    [t],
  );

  const isSpecialTool = useCallback(
    (toolName: string) => toolName === ASK_USER_TOOL_NAME,
    [],
  );

  const renderPendingTool = useCallback(
    (tool: ToolEntry, index: number) => {
      const questions = readQuestions(tool.input);
      const toolUseId = tool.tool_use_id ?? "";
      // No tool_use_id means the parser hasn't finalized the block yet
      // (input still null on the block_start emit). Render a placeholder
      // so the user sees activity, but don't try to submit against an
      // empty id.
      if (!toolUseId) {
        return (
          <div key={`ask-pending-${index}`} className="rounded-xl border border-border/50 bg-card/40 px-4 py-3 text-sm text-muted-foreground italic">
            {t("askUserQuestion.preparing", { defaultValue: "Preparing question..." })}
          </div>
        );
      }
      return (
        <AskUserQuestionCard
          key={`ask-pending-${toolUseId}`}
          toolUseId={toolUseId}
          questions={questions}
          labels={labels}
          onSubmit={async (answer) => {
            await getEngine().submitUserInput(agentPath, sessionKey, toolUseId, answer);
          }}
        />
      );
    },
    [agentPath, sessionKey, labels, t],
  );

  const renderToolResult = useCallback(
    (tool: ToolEntry, index: number) => {
      const questions = readQuestions(tool.input);
      const toolUseId = tool.tool_use_id ?? `idx-${index}`;
      const answered = readAnswered(tool.result);
      return (
        <AskUserQuestionCard
          key={`ask-done-${toolUseId}`}
          toolUseId={toolUseId}
          questions={questions}
          labels={labels}
          answered={answered}
          onSubmit={async () => {
            // Already answered — onSubmit should never fire from the
            // read-only AnsweredView. Provide a no-op to satisfy the
            // required prop.
          }}
        />
      );
    },
    [labels],
  );

  return useMemo(
    () => ({ isSpecialTool, renderPendingTool, renderToolResult }),
    [isSpecialTool, renderPendingTool, renderToolResult],
  );
}
