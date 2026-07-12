import { Button, Input, Spinner } from "@houston-ai/core";
import { AlertTriangle, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MoveErrorKind, TeamRef } from "../../lib/share-via-team";
import { MAX_TEAM_NAME_LENGTH } from "../shell/create-team-model";

/**
 * Presentational steps for {@link ShareViaTeamFlow}. Each renders one state of
 * the pure `share-via-team` machine; all logic (transitions, wire calls) stays
 * in the container. App-internal, so they read `t()` directly (the library
 * boundary is for `ui/`, not app tabs).
 */

/** Step 1 — pick an existing team the caller owns/admins, or create one inline. */
export function PickStep({
  teams,
  creating,
  createError,
  isCreating,
  onPick,
  onStartCreate,
  onCreate,
}: {
  teams: TeamRef[];
  creating: boolean;
  createError: string | null;
  isCreating: boolean;
  onPick: (team: TeamRef) => void;
  onStartCreate: () => void;
  onCreate: (name: string) => void;
}) {
  const { t } = useTranslation("teams");
  const [name, setName] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value || isCreating) return;
    onCreate(value);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        {t("shareViaTeam.pick.subtitle")}
      </p>

      {teams.length > 0 ? (
        <ul className="space-y-2">
          {teams.map((team) => (
            <li key={team.slug}>
              <button
                type="button"
                onClick={() => onPick(team)}
                className="flex w-full items-center rounded-xl border border-line bg-input px-4 py-3 text-left text-sm font-medium hover:bg-chip focus:outline-none focus:ring-2 focus:ring-focus/20"
              >
                {team.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t("shareViaTeam.pick.empty")}</p>
      )}

      {creating ? (
        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              autoFocus
              value={name}
              maxLength={MAX_TEAM_NAME_LENGTH}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("shareViaTeam.pick.namePlaceholder")}
              aria-label={t("shareViaTeam.pick.nameLabel")}
              disabled={isCreating}
              className="rounded-xl"
            />
          </div>
          <Button type="submit" disabled={!name.trim() || isCreating}>
            {isCreating
              ? t("shareViaTeam.pick.creating")
              : t("shareViaTeam.pick.create")}
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start rounded-xl"
          onClick={onStartCreate}
        >
          <Plus className="size-4" />
          {t("shareViaTeam.pick.createTrigger")}
        </Button>
      )}

      {createError ? (
        <p className="text-sm text-danger">{createError}</p>
      ) : null}
    </div>
  );
}

/** Step 2 — honest confirmation of the move (destination + brief downtime). */
export function ConfirmStep({
  agentName,
  team,
  moving,
  onCancel,
  onMove,
}: {
  agentName: string;
  team: TeamRef;
  moving: boolean;
  onCancel: () => void;
  onMove: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">
        {t("shareViaTeam.confirm.body", { agent: agentName, team: team.name })}
      </p>
      <p className="text-xs text-ink-muted">
        {t("shareViaTeam.confirm.downtime")}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={moving}>
          {t("shareViaTeam.confirm.cancel")}
        </Button>
        <Button onClick={onMove} disabled={moving}>
          {t("shareViaTeam.confirm.move")}
        </Button>
      </div>
    </div>
  );
}

/** A centered spinner + caption, shared by the moving and switching steps. */
export function BusyStep({
  heading,
  body,
}: {
  heading: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Spinner className="size-6" />
      <p className="text-sm font-medium text-ink">{heading}</p>
      {body ? <p className="text-xs text-ink-muted">{body}</p> : null}
    </div>
  );
}

/** Move failed — retryable errors offer a retry; `unmovable_volume` does not. */
export function MoveFailedStep({
  error,
  canRetry,
  onRetry,
  onClose,
}: {
  error: MoveErrorKind;
  canRetry: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-sm text-ink">
          {t(`shareViaTeam.moveFailed.${error}`)}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("shareViaTeam.moveFailed.close")}
        </Button>
        {canRetry ? (
          <Button onClick={onRetry}>
            {t("shareViaTeam.moveFailed.retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Switch failed — the move succeeded but the flow couldn't switch the active
 * space to the team. Inviting now would target the personal space, so the flow
 * stops here and offers a retry of the switch (or close; the agent already moved).
 */
export function SwitchFailedStep({
  team,
  onRetry,
  onClose,
}: {
  team: TeamRef;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <p className="text-sm text-ink">
          {t("shareViaTeam.switchFailed.body", { team: team.name })}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t("shareViaTeam.switchFailed.close")}
        </Button>
        <Button onClick={onRetry}>
          {t("shareViaTeam.switchFailed.retry")}
        </Button>
      </div>
    </div>
  );
}
