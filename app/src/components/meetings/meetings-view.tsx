import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Video, Users, Captions, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  ScrollArea,
  Separator,
  Skeleton,
  Textarea,
} from "@houston-ai/core";
import type { Meeting, MeetingStatus } from "@houston-ai/engine-client";
import { useAgentStore } from "../../stores/agents";
import {
  useMeetings,
  useCreateMeeting,
  useDeleteMeeting,
  useEndMeeting,
} from "../../hooks/queries";
import { cn } from "@houston-ai/core";

// ── Create Dialog ────────────────────────────────────────────────────────────

interface CreateDialogProps {
  agentPath: string;
  onClose: () => void;
}

function CreateDialog({ agentPath, onClose }: CreateDialogProps) {
  const { t } = useTranslation("meetings");
  const createMeeting = useCreateMeeting(agentPath);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [botName, setBotName] = useState("");
  const [context, setContext] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    const meeting = await createMeeting.mutateAsync({
      title: title.trim(),
      meet_url: url.trim(),
      bot_name: botName.trim() || undefined,
      context: context.trim() || undefined,
      status: "live",
    });
    const eng = window.__HOUSTON_ENGINE__;
    if (eng) {
      await invoke("meeting_open_window", {
        args: {
          meetingId: meeting.id,
          meetUrl: meeting.meet_url,
          botName: meeting.bot_name ?? null,
          agentPath: agentPath,
          engineUrl: eng.baseUrl,
          engineToken: eng.token,
        },
      }).catch((err: unknown) => {
        console.error("[meetings] failed to open window:", err);
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold">{t("actions.new")}</h2>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.title")}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("form.titlePlaceholder")} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.url")}</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("form.urlPlaceholder")} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.botName")}</label>
          <Input value={botName} onChange={(e) => setBotName(e.target.value)} placeholder={t("form.botNamePlaceholder")} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("form.context")}</label>
          <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder={t("form.contextPlaceholder")} rows={2} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("form.cancel")}</Button>
          <Button type="submit" disabled={createMeeting.isPending}>{t("form.create")}</Button>
        </div>
      </form>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<MeetingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  upcoming: "secondary",
  live: "default",
  processing: "secondary",
  completed: "outline",
  error: "destructive",
};

function StatusBadge({ status }: { status: MeetingStatus }) {
  const { t } = useTranslation("meetings");
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn(status === "live" && "bg-green-500 text-white")}>
      {t(`status.${status}`)}
    </Badge>
  );
}

// ── Meeting list item ────────────────────────────────────────────────────────

function MeetingItem({ meeting, selected, onSelect }: { meeting: Meeting; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation("meetings");
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-3 rounded-lg flex flex-col gap-1 transition-colors hover:bg-muted/60",
        selected && "bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{meeting.title}</span>
        <StatusBadge status={meeting.status} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {(meeting.participants?.length ?? 0) > 0 && (
          <span className="flex items-center gap-1"><Users className="size-3" />{meeting.participants.length}</span>
        )}
        {meeting.caption_count > 0 && (
          <span className="flex items-center gap-1"><Captions className="size-3" />{t("detail.captions", { count: meeting.caption_count })}</span>
        )}
      </div>
    </button>
  );
}

// ── Detail pane ──────────────────────────────────────────────────────────────

function MeetingDetail({ meeting, agentPath, onDelete }: { meeting: Meeting; agentPath: string; onDelete: () => void }) {
  const { t } = useTranslation("meetings");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMeeting = useDeleteMeeting(agentPath);
  const endMeeting = useEndMeeting(agentPath);

  const handleDelete = async () => {
    await deleteMeeting.mutateAsync(meeting.id);
    onDelete();
  };

  const handleEnd = async () => {
    await invoke("meeting_close_window", { meetingId: meeting.id }).catch(
      (err: unknown) => console.warn("[meetings] close window:", err),
    );
    await endMeeting.mutateAsync(meeting.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="text-base font-semibold truncate">{meeting.title}</h2>
          <a href={meeting.meet_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline truncate">{meeting.meet_url}</a>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={meeting.status} />
          {meeting.status === "live" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={endMeeting.isPending}
              onClick={() => { void handleEnd(); }}
            >
              {t("actions.end")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>{t("actions.delete")}</Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          {(meeting.participants?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("detail.participants")}</p>
              <div className="flex flex-wrap gap-1">
                {(meeting.participants ?? []).map((p) => (
                  <Badge key={p} variant="secondary">{p}</Badge>
                ))}
              </div>
            </div>
          )}
          <Separator />
          {meeting.status === "processing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("detail.processing")}
            </div>
          )}
          {meeting.summary_ready && meeting.summary && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("detail.summary")}</p>
              <p className="text-sm whitespace-pre-wrap">{meeting.summary}</p>
            </div>
          )}
          {meeting.action_items_count > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t("detail.actionItems", { count: meeting.action_items_count })}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{t("detail.transcript")}</p>
            {meeting.caption_count > 0 ? (
              <p className="text-xs text-muted-foreground">{t("detail.captions", { count: meeting.caption_count })}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("detail.transcriptEmpty")}</p>
            )}
          </div>
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("delete.title")}
        description={t("delete.description")}
        confirmLabel={t("delete.confirm")}
        onConfirm={() => { void handleDelete(); }}
      />
    </div>
  );
}

// ── Summary pane ─────────────────────────────────────────────────────────────

function SummaryPane({ meeting }: { meeting: Meeting | null }) {
  const { t } = useTranslation("meetings");
  if (!meeting) return null;
  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <p className="text-xs font-medium text-muted-foreground">{t("detail.summary")}</p>
      <p className="text-sm text-muted-foreground">{t("detail.summaryEmpty")}</p>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MeetingsView() {
  const { t } = useTranslation("meetings");
  const currentAgent = useAgentStore((s) => s.current);
  const agentPath = currentAgent?.folderPath;

  const { data: meetings, isLoading } = useMeetings(agentPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = meetings?.find((m) => m.id === selectedId) ?? null;

  const ordered = [...(meetings ?? [])].sort((a, b) => {
    const rank = { live: 0, upcoming: 1, processing: 2, completed: 3, error: 4 };
    return (rank[a.status] ?? 5) - (rank[b.status] ?? 5);
  });

  if (!agentPath) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("title")}</EmptyTitle>
            <EmptyDescription>{t("empty.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Column 1 — meeting list */}
      <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Video className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold">{t("title")}</h1>
          </div>
          <Button size="icon" variant="ghost" aria-label={t("actions.new")} onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full mb-2 rounded-lg" />)
            ) : ordered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <p className="text-sm font-medium">{t("empty.title")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("empty.description")}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3 mr-1" />{t("actions.new")}
                </Button>
              </div>
            ) : (
              ordered.map((m) => (
                <MeetingItem
                  key={m.id}
                  meeting={m}
                  selected={m.id === selectedId}
                  onSelect={() => setSelectedId(m.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Column 2 — meeting detail */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        {selected ? (
          <MeetingDetail
            meeting={selected}
            agentPath={agentPath}
            onDelete={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyTitle>{t("empty.title")}</EmptyTitle>
                <EmptyDescription>{t("empty.description")}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4 mr-1" />{t("actions.new")}
              </Button>
            </Empty>
          </div>
        )}
      </div>

      {/* Column 3 — summary */}
      <div className="w-72 shrink-0 overflow-hidden">
        <SummaryPane meeting={selected} />
      </div>

      {createOpen && (
        <CreateDialog agentPath={agentPath} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
