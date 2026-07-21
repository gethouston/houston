import type {
  StoreCatalogSort,
  StoreCreatorPage,
} from "@houston-ai/engine-client";
import { fetchStoreCreator } from "@houston-ai/engine-client";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";

/** Paging + sort for a creator's public page (mirrors the browse controls). */
export interface CreatorProfileQuery {
  page?: number;
  sort?: StoreCatalogSort;
}

/**
 * A creator's public page — their profile plus one page of their public
 * listings (`GET /creators/{handle}`). Anonymous, so it works signed out (a
 * shared `/@handle` link or an `houston://store/creator` deep link). Disabled
 * until a handle is present. The page/sort ride the query key so paging or
 * re-sorting caches independently, while an invalidate against
 * `["store-creator", handle]` still clears every page by prefix.
 */
export function useCreatorProfile(
  handle: string | null,
  query: CreatorProfileQuery = {},
): UseQueryResult<StoreCreatorPage> {
  return useQuery<StoreCreatorPage>({
    queryKey: [
      "store-creator",
      handle,
      query.sort ?? "recent",
      query.page ?? 1,
    ],
    queryFn: () =>
      fetchStoreCreator(handle as string, {
        page: query.page,
        sort: query.sort,
      }),
    enabled: Boolean(handle),
    staleTime: 60_000,
  });
}
