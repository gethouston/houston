// Bottom-sheet: pick an agent → open a fresh chat view.
//
// Pure client-side. We DON'T create an activity here — that would
// flash a "New mission" row onto the desktop board the second the
// user picks an agent, even if they immediately back out. Instead
// we generate a `draft-<uuid>` session key and hand the chat view a
// blank canvas. The actual activity (and therefore the desktop row)
// is created on the first real send. See `chat-view.tsx::handleSend`.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Agent } from "@houston-ai/engine-client";
import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";

interface Props {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
}

function newDraftKey(): string {
  const id =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `draft-${id}`;
}

export function NewMissionSheet({ open, onClose, agents }: Props) {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  function pickAgent(agent: Agent) {
    setError(null);
    onClose();
    nav(
      `/session/${encodeURIComponent(newDraftKey())}?agent=${encodeURIComponent(agent.folderPath)}&new=1`,
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setError(null);
              onClose();
            }}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] w-full max-w-[430px] flex-col rounded-t-2xl bg-background shadow-2xl safe-bottom"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="px-4 pb-4">
              <h2 className="text-lg font-semibold">Pick an agent</h2>
              <ul className="mt-3 divide-y divide-border">
                {agents.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No agents available on this Mac.
                  </li>
                )}
                {agents.map((a) => (
                  <li key={a.id}>
                    <button
                      className="touchable w-full flex items-center gap-3 py-3 text-left hover:bg-accent/60 rounded-lg px-2"
                      onClick={() => pickAgent(a)}
                    >
                      <HoustonAvatar
                        color={resolveAgentColor(a.color)}
                        diameter={40}
                      />
                      <p className="truncate text-sm font-medium flex-1">
                        {a.name}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              {error && (
                <p className="mt-3 text-xs text-destructive">{error}</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
