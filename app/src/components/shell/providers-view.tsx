import { ProviderSection } from "../settings/sections/provider";

/**
 * Standalone AI-providers page for the sidebar's top-level nav entry.
 * Renders the exact same section as Settings → AI provider (which stays);
 * this is just a second, quicker route to it. Same column width as the
 * settings content pane so switching between the two doesn't reflow.
 */
export function ProvidersView() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 py-10">
        <ProviderSection />
      </div>
    </div>
  );
}
