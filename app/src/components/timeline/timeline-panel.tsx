/**
 * `<TimelinePanel />` — cross-session activity timeline for an agent.
 * Phase 4 of RFC #248 / `advanced.timeline`.
 *
 * Each row = one persisted chat_feed entry. Newest first. The row's
 * preview text + iconography are derived from the entry's `feedType`
 * (user message, assistant text, tool call, etc.).
 */
import { useTranslation } from "react-i18next";
import type { TimelineEvent } from "@houston-ai/engine-client";
import { useTimeline } from "../../hooks/use-timeline";

interface Props {
  agentPath: string;
}

export function TimelinePanel({ agentPath }: Props) {
  const { t, i18n } = useTranslation("timeline");
  const q = useTimeline(agentPath);

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  const events = q.data?.events ?? [];

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-1">
        <h3 className="text-base font-semibold">{t("empty.title")}</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {t("empty.description")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <ul className="flex flex-col divide-y divide-border/30">
        {events.map((event, idx) => (
          <TimelineRow
            key={`${event.claudeSessionId}-${event.timestamp}-${idx}`}
            event={event}
            locale={i18n.language}
          />
        ))}
      </ul>
      {q.data && events.length >= q.data.limit && (
        <p className="px-6 py-3 text-[11px] text-muted-foreground text-center border-t border-border/30">
          {t("limitNote", { limit: q.data.limit })}
        </p>
      )}
    </div>
  );
}

function TimelineRow({
  event,
  locale,
}: {
  event: TimelineEvent;
  locale: string;
}) {
  const { t } = useTranslation("timeline");
  const label = decodeFeedType(event.feedType, t);
  const preview = previewFromDataJson(event.feedType, event.dataJson);
  return (
    <li className="px-4 py-2 hover:bg-accent/40 transition-colors">
      <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono shrink-0">
          {formatRelative(event.timestamp, locale)}
        </span>
        <span className={`shrink-0 font-medium ${typeColor(event.feedType)}`}>
          {label}
        </span>
        <span className="truncate">{preview}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono truncate">
        {t("session", { id: event.claudeSessionId.slice(0, 8) })}
      </div>
    </li>
  );
}

const PREVIEW_MAX = 160;

function previewFromDataJson(feedType: string, dataJson: string): string {
  // Best-effort: many feed types store a JSON string of just the body.
  // Others store an object with a `text`/`content`/`result` field.
  try {
    const parsed = JSON.parse(dataJson);
    if (typeof parsed === "string") return truncate(parsed);
    if (parsed && typeof parsed === "object") {
      for (const key of ["text", "content", "result", "details", "message"]) {
        const v = (parsed as Record<string, unknown>)[key];
        if (typeof v === "string") return truncate(v);
      }
      // Tool call: name + first input key
      if (feedType === "tool_call" && typeof parsed.name === "string") {
        return truncate(`${parsed.name}(${JSON.stringify(parsed.input ?? {}).slice(0, 80)})`);
      }
    }
    return "";
  } catch {
    return "";
  }
}

function truncate(s: string): string {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length > PREVIEW_MAX
    ? `${trimmed.slice(0, PREVIEW_MAX - 1)}…`
    : trimmed;
}

function decodeFeedType(t: string, tr: (k: string) => string): string {
  switch (t) {
    case "user_message":
      return tr("type.user");
    case "assistant_text":
      return tr("type.assistant");
    case "tool_call":
      return tr("type.toolCall");
    case "tool_result":
      return tr("type.toolResult");
    case "system_message":
      return tr("type.system");
    case "thinking":
      return tr("type.thinking");
    case "final_result":
      return tr("type.final");
    case "file_changes":
      return tr("type.files");
    case "provider_error":
    case "tool_runtime_error":
      return tr("type.error");
    default:
      return t;
  }
}

function typeColor(t: string): string {
  switch (t) {
    case "user_message":
      return "text-blue-500";
    case "assistant_text":
      return "text-foreground";
    case "tool_call":
    case "tool_result":
      return "text-yellow-500";
    case "final_result":
      return "text-green-500";
    case "provider_error":
    case "tool_runtime_error":
      return "text-red-500";
    case "system_message":
    case "thinking":
      return "text-muted-foreground";
    case "file_changes":
      return "text-purple-500";
    default:
      return "text-muted-foreground";
  }
}

function formatRelative(iso: string, locale: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60_000);
    const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(diffMin) < 60) return fmt.format(diffMin, "minute");
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return fmt.format(diffHour, "hour");
    const diffDay = Math.round(diffHour / 24);
    if (Math.abs(diffDay) < 30) return fmt.format(diffDay, "day");
    const diffMonth = Math.round(diffDay / 30);
    if (Math.abs(diffMonth) < 12) return fmt.format(diffMonth, "month");
    return fmt.format(Math.round(diffMonth / 12), "year");
  } catch {
    return iso;
  }
}
