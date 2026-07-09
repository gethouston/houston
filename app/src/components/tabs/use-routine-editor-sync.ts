import type { Routine } from "@houston-ai/engine-client";
import type {
  RoutineEditorSection,
  RoutineFormData,
} from "@houston-ai/routines";
import { useEffect, useRef } from "react";
import { changedEditorSections } from "./routine-flash-sections";
import {
  formMatchesRoutine,
  routineToFormData,
  type View,
} from "./routines-tab-model";

interface Args {
  /** Active agent — the remembered draft id resets when it changes. */
  agentId: string;
  view: View;
  routines: Routine[] | undefined;
  form: RoutineFormData;
  baseline: RoutineFormData;
  /** Id of the agent's live (or last-seen) draft create-chat. */
  draftActivityId: string | undefined;
  openEditor: (routineId: string) => void;
  setForm: (form: RoutineFormData) => void;
  setBaseline: (form: RoutineFormData) => void;
  /**
   * Fired when an EXTERNAL edit (the setup chat's agent) refreshed the open
   * form, with the editor sections it touched — drives the section flash.
   */
  onExternalChange?: (sections: RoutineEditorSection[]) => void;
}

/**
 * Keeps the routine editor in lockstep with the setup chat (HOU-725).
 *
 * 1. New-routine view: the moment a routine appears carrying the draft
 *    chat's id in `setup_activity_id` (the agent just created it), switch
 *    to editing that routine — the empty creation form would otherwise
 *    invite a duplicate.
 * 2. Edit view: when the agent modifies the open routine from the chat, the
 *    form refreshes — but only while the user has no unsaved edits of their
 *    own, so typing is never clobbered.
 *
 * Returns a ref holding the draft chat's id: the draft disappears from the
 * activity query the instant a routine claims it, so the id must outlive it
 * for both the auto-switch and the create-submit link stamp.
 */
export function useRoutineEditorSync({
  agentId,
  view,
  routines,
  form,
  baseline,
  draftActivityId,
  openEditor,
  setForm,
  setBaseline,
  onExternalChange,
}: Args) {
  const draftIdRef = useRef<string | null>(null);
  const trackedAgentRef = useRef(agentId);
  if (trackedAgentRef.current !== agentId) {
    trackedAgentRef.current = agentId;
    draftIdRef.current = null;
  }
  if (draftActivityId) draftIdRef.current = draftActivityId;

  useEffect(() => {
    if (view.type !== "editor" || view.editId) return;
    const draftId = draftIdRef.current;
    if (!draftId) return;
    const created = routines?.find((r) => r.setup_activity_id === draftId);
    if (created) openEditor(created.id);
  }, [routines, view, openEditor]);

  useEffect(() => {
    if (view.type !== "editor" || !view.editId) return;
    const routine = routines?.find((r) => r.id === view.editId);
    if (!routine) return;
    const next = routineToFormData(routine);
    if (formMatchesRoutine(next, baseline)) return; // nothing changed upstream
    if (!formMatchesRoutine(form, baseline)) return; // user has local edits
    setForm(next);
    setBaseline(next);
    // Attribute the refresh: light up the sections the agent's edit touched.
    const sections = changedEditorSections(baseline, next);
    if (sections.length > 0) onExternalChange?.(sections);
  }, [routines, view, form, baseline, setForm, setBaseline, onExternalChange]);

  return draftIdRef;
}
