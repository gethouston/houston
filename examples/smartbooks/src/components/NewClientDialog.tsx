import { useState } from "react";
import { createClient } from "../lib/clients";
import type { Client } from "../lib/clients";

interface Props {
  agentPath: string;
  onClose: () => void;
  onCreated: (client: Client) => void;
}

export function NewClientDialog({ agentPath, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = await createClient(agentPath, trimmed);
      onCreated(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">New client</h2>
        <p className="muted modal__hint">
          We'll create a folder for their statements, receipts, and workbooks.
          You can drop files in right after.
        </p>
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Client name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!name.trim() || submitting}
            >
              {submitting ? "Creating…" : "Create client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
