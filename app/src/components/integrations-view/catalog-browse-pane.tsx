import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ConnectFlow } from "../integrations";
import { matchesQuery } from "../integrations/browse-model";
import { CatalogPane } from "./catalog-pane";

/** The Composio browse pane, including its late-connect query guard. */
export function CatalogBrowsePane({
  catalog,
  connections,
  surface,
  query,
  setQuery,
  category,
  isLoading,
  connectFlow,
  onRemove,
  children,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  surface: string;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  isLoading: boolean;
  connectFlow: ConnectFlow;
  onRemove: (toolkit: string, connectionId?: string) => void;
  children?: ReactNode;
}) {
  return (
    <CatalogPane
      catalog={catalog}
      connections={connections}
      surface={surface}
      query={query}
      category={category}
      isLoading={isLoading}
      connectFlow={connectFlow}
      onConnected={(toolkit) =>
        setQuery((currentQuery) => {
          if (!currentQuery.trim()) return currentQuery;
          const app = catalog.find((item) => item.slug === toolkit);
          return app && matchesQuery(app, currentQuery.trim().toLowerCase())
            ? ""
            : currentQuery;
        })
      }
      onRemove={onRemove}
    >
      {children}
    </CatalogPane>
  );
}
