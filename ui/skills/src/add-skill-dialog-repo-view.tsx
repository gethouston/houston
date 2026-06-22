import { Button, cn, Spinner } from "@houston-ai/core";
import { AlertCircle, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RepoDoneState } from "./add-skill-dialog-repo-done";
import {
  DEFAULT_REPO_VIEW_LABELS,
  type RepoViewLabels,
} from "./add-skill-dialog-repo-labels";
import { RepoSkillRow } from "./add-skill-dialog-repo-row";
import { RepoSelectionSummary } from "./add-skill-dialog-repo-selection";
import type { RepoStage } from "./add-skill-dialog-repo-stage";
import type { RepoSkill } from "./types";

export interface RepoViewProps {
  onList: (source: string) => Promise<RepoSkill[]>;
  onInstall: (source: string, skills: RepoSkill[]) => Promise<string[]>;
  labels?: RepoViewLabels;
}

export function RepoView({ onList, onInstall, labels }: RepoViewProps) {
  const l = { ...DEFAULT_REPO_VIEW_LABELS, ...labels };
  const [source, setSource] = useState("");
  const [stage, setStage] = useState<RepoStage>({ kind: "input" });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleDiscover = useCallback(async () => {
    const trimmed = source.trim();
    if (!trimmed) return;
    setError("");
    setStage({ kind: "loading", source: trimmed });
    try {
      const skills = await onList(trimmed);
      setStage({ kind: "selection", source: trimmed, skills });
      setSelected(new Set(skills.map((s) => s.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: "input" });
    }
  }, [source, onList]);

  const toggleSkill = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleInstall = useCallback(async () => {
    if (stage.kind !== "selection") return;
    const toInstall = stage.skills.filter((s) => selected.has(s.id));
    if (toInstall.length === 0) return;
    setError("");
    setStage({
      kind: "installing",
      source: stage.source,
      skills: stage.skills,
      selected,
    });
    try {
      const names = await onInstall(stage.source, toInstall);
      setStage({ kind: "done", installed: names });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage({
        kind: "selection",
        source: stage.source,
        skills: stage.skills,
      });
    }
  }, [stage, selected, onInstall]);

  const isLoading = stage.kind === "loading";
  const isInstalling = stage.kind === "installing";
  const showList = stage.kind === "selection" || stage.kind === "installing";
  const listSkills = showList ? stage.skills : [];

  return (
    <>
      <div className="shrink-0 px-6 pb-3 space-y-2">
        {stage.kind !== "done" && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  if (stage.kind !== "input") setStage({ kind: "input" });
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    source.trim() &&
                    !isLoading &&
                    !isInstalling
                  ) {
                    if (stage.kind === "selection") handleInstall();
                    else handleDiscover();
                  }
                }}
                placeholder={l.sourcePlaceholder}
                disabled={isLoading || isInstalling}
                className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm
                           placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            {stage.kind === "input" || stage.kind === "loading" ? (
              <Button
                onClick={handleDiscover}
                disabled={!source.trim() || isLoading}
                className="rounded-full shrink-0"
              >
                {isLoading ? <Spinner className="size-4" /> : l.findSkills}
              </Button>
            ) : (
              <Button
                onClick={handleInstall}
                disabled={selected.size === 0 || isInstalling}
                className="rounded-full shrink-0"
              >
                {isInstalling ? (
                  <Spinner className="size-4" />
                ) : (
                  l.installSelected(selected.size)
                )}
              </Button>
            )}
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {stage.kind === "selection" && (
          <RepoSelectionSummary
            skillCount={stage.skills.length}
            selectedCount={selected.size}
            labels={l}
            onToggleAll={() => {
              if (selected.size === stage.skills.length) {
                setSelected(new Set());
              } else {
                setSelected(new Set(stage.skills.map((s) => s.id)));
              }
            }}
          />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-6">
        {stage.kind === "input" && !error && (
          <p className="text-sm text-muted-foreground px-6 py-4 text-center">
            {l.inputHint}
          </p>
        )}

        {stage.kind === "loading" && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}

        {showList && listSkills.length > 0 && (
          <div
            className={cn(
              "divide-y divide-border border-y border-border",
              isInstalling && "opacity-60 pointer-events-none",
            )}
          >
            {listSkills.map((skill) => {
              const isSelected =
                stage.kind === "installing"
                  ? stage.selected.has(skill.id)
                  : selected.has(skill.id);
              if (stage.kind === "installing" && !isSelected) return null;
              return (
                <RepoSkillRow
                  key={skill.id}
                  skill={skill}
                  selected={isSelected}
                  onToggle={() => toggleSkill(skill.id)}
                />
              );
            })}
          </div>
        )}

        {stage.kind === "done" && (
          <RepoDoneState
            installed={stage.installed}
            labels={l}
            onReset={() => {
              setStage({ kind: "input" });
              setSource("");
              setError("");
              setSelected(new Set());
            }}
          />
        )}
      </div>
    </>
  );
}
