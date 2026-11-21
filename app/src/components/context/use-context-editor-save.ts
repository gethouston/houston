import { useCallback, useEffect, useRef, useState } from "react";
import { isDirty, isWysiwygSafe, shouldReseed } from "./context-editor-model";

export type SaveState = "idle" | "saving" | "saved";

export function useContextEditorSave({
  content,
  onSave,
  readOnly,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(content);
  const [state, setState] = useState<SaveState>("idle");
  const [plainDoc, setPlainDoc] = useState(() => !isWysiwygSafe(content));

  const valueRef = useRef(content);
  const baselineRef = useRef(content);
  const focusedRef = useRef(false);
  const awaitingSeedRef = useRef(true);
  const contentPropRef = useRef(content);
  const pendingExternalRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  const readOnlyRef = useRef(readOnly);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastQueuedRef = useRef<string | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const seedEpochRef = useRef(0);
  const mountedRef = useRef(true);

  onSaveRef.current = onSave;

  const applyReseed = useCallback((next: string) => {
    seedEpochRef.current += 1;
    awaitingSeedRef.current = true;
    valueRef.current = next;
    baselineRef.current = next;
    pendingExternalRef.current = null;
    setPlainDoc(!isWysiwygSafe(next));
    setValue(next);
  }, []);

  const enqueueSave = useCallback((next: string) => {
    if (lastQueuedRef.current === next) return;
    lastQueuedRef.current = next;
    pendingExternalRef.current = null;
    const epoch = seedEpochRef.current;
    setState("saving");
    chainRef.current = chainRef.current
      .then(() => onSaveRef.current(next))
      .then(() => {
        if (seedEpochRef.current === epoch) baselineRef.current = next;
        if (!mountedRef.current) return;
        setState("saved");
        if (savedTimerRef.current !== null)
          window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        lastQueuedRef.current = baselineRef.current;
        if (mountedRef.current) setState("idle");
      });
  }, []);

  const handleChange = useCallback((markdown: string) => {
    valueRef.current = markdown;
    setValue(markdown);
    if (awaitingSeedRef.current) {
      baselineRef.current = markdown;
      awaitingSeedRef.current = false;
    }
  }, []);

  const handleBlur = useCallback(() => {
    if (readOnlyRef.current) return;
    const current = valueRef.current;
    if (isDirty(current, baselineRef.current)) enqueueSave(current);
  }, [enqueueSave]);

  const handleFocusChange = useCallback(
    (focused: boolean) => {
      focusedRef.current = focused;
      if (
        !focused &&
        pendingExternalRef.current !== null &&
        !isDirty(valueRef.current, baselineRef.current)
      ) {
        applyReseed(pendingExternalRef.current);
      }
    },
    [applyReseed],
  );

  useEffect(() => {
    if (contentPropRef.current === content) return;
    contentPropRef.current = content;
    const dirty = isDirty(valueRef.current, baselineRef.current);
    if (shouldReseed({ focused: focusedRef.current, dirty })) {
      applyReseed(content);
    } else {
      pendingExternalRef.current = content;
    }
  }, [content, applyReseed]);

  useEffect(() => {
    const was = readOnlyRef.current;
    readOnlyRef.current = readOnly;
    if (!was && readOnly && isDirty(valueRef.current, baselineRef.current)) {
      enqueueSave(valueRef.current);
    }
  }, [readOnly, enqueueSave]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedTimerRef.current !== null)
        window.clearTimeout(savedTimerRef.current);
      if (readOnlyRef.current) return;
      if (!isDirty(valueRef.current, baselineRef.current)) return;
      if (lastQueuedRef.current === valueRef.current) return;
      lastQueuedRef.current = valueRef.current;
      chainRef.current = chainRef.current
        .then(() => onSaveRef.current(valueRef.current))
        .catch(() => {});
    };
  }, []);

  return {
    value,
    state,
    plainDoc,
    handleChange,
    handleBlur,
    handleFocusChange,
  };
}
