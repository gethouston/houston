import { Button, type Toast, ToastContainer } from "@houston-ai/core";
import { useCallback, useRef, useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * The container is `fixed bottom-4 right-4`, so there is exactly one on the
 * page and every row pushes into the same queue — which is also the only
 * honest way to review how the stack behaves.
 */
function useToastQueue() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((queue) => queue.filter((one) => one.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setToasts((queue) => [...queue, { ...toast, id }]);
  }, []);

  return { toasts, push, dismiss, clear: () => setToasts([]) };
}

const props: SpecimenProp[] = [
  {
    name: "toasts",
    type: "Toast[]",
    note: "Required. The live queue — the caller owns it, the container only paints it.",
  },
  {
    name: "onDismiss",
    type: "(id: string) => void",
    note: "Required. Fires from the X. Nothing auto-expires; the caller times it out.",
  },
  { name: "Toast.id", type: "string", note: "Required. The animation key." },
  {
    name: "Toast.message",
    type: "string",
    note: "Required. One sentence, in the user's words.",
  },
  {
    name: "Toast.variant",
    type: '"success" | "error" | "info"',
    note: "Required. Picks the icon, its colour and the border tint.",
  },
  {
    name: "Toast.action",
    type: "{ label: string; onClick: () => void }",
    note: 'Optional pill under the message — this is where "Report bug" goes.',
  },
];

function ToastContainerSpecimen() {
  const { toasts, push, dismiss, clear } = useToastQueue();

  return (
    <SpecimenPage
      title="ToastContainer"
      intro="Houston's own toast stack: a controlled queue pinned to the bottom-right. Every error a user action can produce has to land here."
    >
      <SpecimenSection
        title="Variants"
        note="`variant` picks the icon, the icon colour and the border tint. Push one and watch the bottom-right corner."
      >
        <SpecimenRow label="success">
          <Button
            onClick={() =>
              push({ variant: "success", message: "Inbox Zero saved." })
            }
          >
            Push success
          </Button>
        </SpecimenRow>
        <SpecimenRow label="error">
          <Button
            variant="destructive"
            onClick={() =>
              push({
                variant: "error",
                message:
                  "Gmail rejected the connection. Reconnect to continue.",
              })
            }
          >
            Push error
          </Button>
        </SpecimenRow>
        <SpecimenRow label="info">
          <Button
            variant="outline"
            onClick={() =>
              push({
                variant: "info",
                message: "Meeting Notes is running. This takes about a minute.",
              })
            }
          >
            Push info
          </Button>
        </SpecimenRow>
        <SpecimenRow label="With action">
          <Button
            variant="outline"
            onClick={() =>
              push({
                variant: "error",
                message: "Weekly Report could not reach Sheets.",
                action: {
                  label: "Report bug",
                  onClick: () =>
                    push({
                      variant: "success",
                      message: "Thanks, the logs are on their way.",
                    }),
                },
              })
            }
          >
            Push error with action
          </Button>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The queue is the state. Entry, layout shift and exit are all framer-motion, so stacking and dismissing are worth watching live."
      >
        <SpecimenRow label={`Queue: ${toasts.length} toast(s)`}>
          <Button
            variant="secondary"
            onClick={() => {
              push({ variant: "info", message: "Inbox Zero queued." });
              push({ variant: "success", message: "Meeting Notes finished." });
              push({
                variant: "error",
                message: "Weekly Report failed on step 2.",
              });
            }}
          >
            Push three at once
          </Button>
          <Button
            variant="ghost"
            onClick={clear}
            disabled={toasts.length === 0}
          >
            Clear queue
          </Button>
        </SpecimenRow>
        <SpecimenRow label="Empty">
          <span className="text-[13px] text-ink-muted">
            An empty `toasts` array renders the container with nothing in it —
            no placeholder, no reserved space.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "bg-card",
          "border-success/30",
          "border-danger/30",
          "text-success",
          "text-danger",
          "text-action",
          "text-ink",
          "text-ink-muted",
          "bg-ink/10",
          "hover:bg-ink/20",
        ]}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["ToastContainer"];

export const specimen: Specimen = {
  id: "core-toast-container",
  title: "ToastContainer",
  group: "Overlays",
  render: () => <ToastContainerSpecimen />,
};
