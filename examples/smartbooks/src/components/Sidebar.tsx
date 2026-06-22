import type { Client } from "../lib/clients";

interface Props {
  clients: Client[];
  selectedId: string | null;
  onSelect: (client: Client) => void;
  onNew: () => void;
}

export function Sidebar({ clients, selectedId, onSelect, onNew }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="sidebar__label">Clients</span>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onNew}
        >
          + New
        </button>
      </div>
      {clients.length === 0 ? (
        <div className="sidebar__empty">
          <p className="muted">No clients yet.</p>
          <button type="button" className="btn btn--primary" onClick={onNew}>
            Add your first client
          </button>
        </div>
      ) : (
        <ul className="sidebar__list">
          {clients.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`sidebar__item${active ? " sidebar__item--active" : ""}`}
                  onClick={() => onSelect(c)}
                >
                  <span className="sidebar__avatar">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="sidebar__name">{c.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
