import { useCallback, useEffect, useRef, useState } from "react";
import { isDirty, isWysiwygSafe, shouldReseed } from "./context-editor-model";

export type SaveState = "idle" | "saving" | "saved";

/**
 * The standing-context editor's save machine: value + baseline + save state,
 * with every write funneled through ONE promise queue — blur saves, the
 * unmount flush, and the read-only flush — so writes reach the store in
 * order and the same text is never submitted twice back-to-back.
 *
 * The dirty baseline is the SEEDED DOC'S OWN serialization (announced by the
 * editor on create), so markdown normalization never reads as a user edit.
 * `plainDoc` decides WYSIWYG vs plain-text fallback per seed
 * (`isWysiwygSafe`): a document the rich schema would corrupt is edited raw.
 */
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

  onSaveRef.current = onSave;

  const applyReseed = useCallback((next: string) => {
    awaitingSeedRef.current = true;
    valueRef.current = next;
    // The baseline moves WITH the seed, so a blur between the seed and the
    // editor's normalization echo can never read external text as an edit.
    baselineRef.current = next;
    pendingExternalRef.current = null;
    setPlainDoc(!isWysiwygSafe(next));
    setValue(next);
  }, []);

  const enqueueSave = useCallback((next: string) => {
    if (lastQueuedRef.current === next) return;
    lastQueuedRef.current = next;
    setState("saving");
    chainRef.current = chainRef.current
      .then(() => onSaveRef.current(next))
      .then(() => {
        baselineRef.current = next;
        setState("saved");
        if (savedTimerRef.current !== null)
          window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setState("idle"), 2000);
      })
      .catch(() => {
        // The data layer owns the toast; recover so "Saving…" never sticks,
        // and reset the dedupe key so a re-blur retries the write.
        lastQueuedRef.current = baselineRef.current;
        setState("idle");
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
      // An external update that arrived mid-edit lands the moment the user
      // leaves the box IF they typed nothing meanwhile — dirty text always
      // wins (its blur save is already queued).
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

  // External content changes: reseed now when the box is idle, otherwise
  // hold the NEWEST revision for the next blur instead of dropping it.
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

  // A box that turns read-only mid-edit SUBMITS what was typed rather than
  // silently discarding it; a rejected write surfaces through the layer.
  useEffect(() => {
    const was = readOnlyRef.current;
    readOnlyRef.current = readOnly;
    if (!was && readOnly && isDirty(valueRef.current, baselineRef.current)) {
      enqueueSave(valueRef.current);
    }
  }, [readOnly, enqueueSave]);

  // Unmount with unsaved text: flush through the same queue. The dedupe key
  // makes this a no-op when the blur save already carried this text.
  useEffect(
    () => () => {
      if (savedTimerRef.current !== null)
        window.clearTimeout(savedTimerRef.current);
      if (readOnlyRef.current) return;
      if (!isDirty(valueRef.current, baselineRef.current)) return;
      if (lastQueuedRef.current === valueRef.current) return;
      lastQueuedRef.current = valueRef.current;
      // The data layer surfaces failures; cleanup has no mounted UI.
      chainRef.current = chainRef.current
        .then(() => onSaveRef.current(valueRef.current))
        .catch(() => {});
    },
    [],
  );

  return {
    value,
    state,
    plainDoc,
    handleChange,
    handleBlur,
    handleFocusChange,
  };
}
