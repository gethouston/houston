/**
 * Dictation state machine hook: mic capture + transcription, exposed as a
 * `DictationControl` the composer hands straight to `ChatPanel`
 * (`@houston-ai/chat`). Model-download consent is a sibling concern, split
 * out to `use-dictation-model-setup.ts`.
 *
 * The capture/transcribe phases are the pure `dictationReducer`
 * (`dictation-reducer.ts`); this hook drives it and layers on the I/O.
 */
import type { DictationControl, DictationLabels } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { showErrorToast } from "../error-toast";
import { osTranscribeAudio } from "../os-bridge";
import { dictationReducer, INITIAL_DICTATION_STATE } from "./dictation-reducer";
import { type DictationRecording, startDictationRecording } from "./recorder";
import {
  type DictationLangHint,
  dictationErrorText as errorText,
} from "./types";
import {
  type DictationModelSetup,
  useDictationModelSetup,
} from "./use-dictation-model-setup";

export type { DictationModelSetup };

/** Shared empty history so the getLevels accessor never allocates when idle. */
const EMPTY_LEVELS: readonly number[] = Object.freeze([]);

export interface UseDictationArgs {
  /** Called with the recognized text once a transcription succeeds and is
   *  non-empty. Never called for a discarded (cancelled) capture. */
  onTranscript: (text: string) => void;
  langHint: DictationLangHint;
  /** False on web (no native mic capture) — `dictation` stays undefined so
   *  ChatPanel hides the mic entirely. */
  enabled: boolean;
}

export interface UseDictationResult {
  dictation: DictationControl | undefined;
  modelSetup: DictationModelSetup;
}

export function useDictation({
  onTranscript,
  langHint,
  enabled,
}: UseDictationArgs): UseDictationResult {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const [machine, dispatch] = useReducer(
    dictationReducer,
    INITIAL_DICTATION_STATE,
  );

  const recordingRef = useRef<DictationRecording | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const langHintRef = useRef(langHint);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    langHintRef.current = langHint;
  }, [langHint]);

  // Forward reference so `runStop`/`beginCapture` and the model-setup hook's
  // `onReady` callback can name each other despite the declaration order
  // (the setup hook must exist before `runStop`, but its `onReady` is
  // `beginCapture`, which is declared after `runStop`).
  const beginCaptureRef = useRef<() => void>(() => {});
  const {
    modelSetup,
    ensureReady,
    reopen,
    reset: resetSetup,
  } = useDictationModelSetup(() => beginCaptureRef.current());

  const runStop = useCallback(
    async (eventType: "stop" | "autoStop") => {
      const session = recordingRef.current;
      if (!session) return;
      recordingRef.current = null;
      dispatch({ type: eventType });
      try {
        const wav = await session.stop();
        const text = await osTranscribeAudio(wav, langHintRef.current);
        dispatch({ type: "transcribeSettled" });
        if (text.trim()) onTranscriptRef.current(text.trim());
      } catch (err) {
        dispatch({ type: "transcribeSettled" });
        if (errorText(err) === "model-not-ready") void reopen();
        else showErrorToast("dictation_transcribe", errorText(err), err);
      }
    },
    [reopen],
  );

  const beginCapture = useCallback(async () => {
    dispatch({ type: "start" });
    try {
      const session = await startDictationRecording(() => {
        void runStop("autoStop");
      });
      recordingRef.current = session;
      dispatch({ type: "micGranted", startedAt: Date.now() });
    } catch (err) {
      dispatch({ type: "micFailed" });
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        addToast({
          title: t("composer.dictation.micDenied"),
          variant: "error",
        });
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        addToast({ title: t("composer.dictation.noMic"), variant: "error" });
      } else {
        showErrorToast("dictation_start_capture", errorText(err), err);
      }
    }
  }, [runStop, addToast, t]);
  useEffect(() => {
    beginCaptureRef.current = () => void beginCapture();
  }, [beginCapture]);

  const handleStart = useCallback(() => {
    if (machine.phase !== "idle") return;
    void ensureReady();
  }, [machine.phase, ensureReady]);

  const handleCancel = useCallback(() => {
    const session = recordingRef.current;
    recordingRef.current = null;
    session?.cancel();
    dispatch({ type: "cancel" });
  }, []);

  // Stable poll accessor for the composer's rAF-driven waveform. Reads the live
  // recorder each call (returns [] before capture / after stop), so the control
  // object can be rebuilt each render without churning this reference.
  const getLevels = useCallback(
    (): readonly number[] => recordingRef.current?.getLevels() ?? EMPTY_LEVELS,
    [],
  );

  // Disabled mid-flow, or unmounting: never leak a live mic stream/context.
  useEffect(() => {
    if (!enabled) {
      recordingRef.current?.cancel();
      recordingRef.current = null;
      dispatch({ type: "reset" });
      resetSetup();
    }
    return () => {
      recordingRef.current?.cancel();
      recordingRef.current = null;
    };
  }, [enabled, resetSetup]);

  const labels: DictationLabels = useMemo(
    () => ({
      start: t("composer.dictation.start"),
      stop: t("composer.dictation.stop"),
      cancel: t("composer.dictation.cancel"),
      recording: t("composer.dictation.recording"),
      transcribing: t("composer.dictation.transcribing"),
    }),
    [t],
  );

  const dictation: DictationControl | undefined = enabled
    ? {
        state: machine.phase,
        recordingStartedAt: machine.recordingStartedAt,
        onStart: handleStart,
        onStop: () => void runStop("stop"),
        onCancel: handleCancel,
        getLevels,
        labels,
      }
    : undefined;

  return { dictation, modelSetup };
}
