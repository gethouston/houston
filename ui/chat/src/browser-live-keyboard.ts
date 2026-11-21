"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  beforeInputKey,
  isLeavePageKey,
  keyDownInput,
  textInput,
} from "./browser-live-keys";
import type { BrowserLiveViewInput } from "./browser-live-types";

export function useBrowserLiveKeyboard(
  fieldRef: RefObject<HTMLTextAreaElement | null>,
  send: (event: BrowserLiveViewInput) => void,
  enabled: boolean,
  onLeave?: () => void,
): void {
  const sendRef = useRef(send);
  const leaveRef = useRef(onLeave);
  useEffect(() => {
    sendRef.current = send;
    leaveRef.current = onLeave;
  });

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !enabled) return;
    const emit = (event: BrowserLiveViewInput | null) => {
      if (event) sendRef.current(event);
    };
    const flush = () => {
      emit(textInput(field.value));
      field.value = "";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isLeavePageKey(e) && leaveRef.current) {
        e.preventDefault();
        leaveRef.current();
        return;
      }
      const event = keyDownInput(e);
      if (!event) return;
      e.preventDefault();
      emit(event);
    };
    const onBeforeInput = (e: InputEvent) => {
      const event = beforeInputKey(e.inputType, field.value);
      if (!event) return;
      e.preventDefault();
      emit(event);
    };
    const onInput = (e: Event) => {
      if (!(e as InputEvent).isComposing) flush();
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      emit(textInput(e.clipboardData?.getData("text/plain") ?? ""));
    };
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("beforeinput", onBeforeInput);
    field.addEventListener("input", onInput);
    field.addEventListener("compositionend", flush);
    field.addEventListener("paste", onPaste);
    return () => {
      field.removeEventListener("keydown", onKeyDown);
      field.removeEventListener("beforeinput", onBeforeInput);
      field.removeEventListener("input", onInput);
      field.removeEventListener("compositionend", flush);
      field.removeEventListener("paste", onPaste);
    };
  }, [fieldRef, enabled]);
}
