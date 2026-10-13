import { InvalidArgumentError } from "commander";

export interface Page<T> {
  items: T[] | undefined;
  nextToken?: string;
}

export interface PageOptions {
  /** Follow next-page tokens until the API runs out of results. */
  all?: boolean;
  /** Stop once this many items have been collected (fetching pages as needed). */
  limit?: number;
}

/**
 * Collect items from a paginated SP-API operation.
 *
 * With neither `all` nor `limit`, a single page is fetched (the API default).
 * `limit` fetches pages until that many items are collected, then truncates.
 * `all` fetches every page.
 */
export async function collectPages<T>(
  fetchPage: (nextToken?: string) => Promise<Page<T>>,
  opts: PageOptions
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | undefined;

  for (;;) {
    const page = await fetchPage(nextToken);
    items.push(...(page.items ?? []));

    if (opts.limit !== undefined && items.length >= opts.limit) {
      return items.slice(0, opts.limit);
    }
    if (!opts.all && opts.limit === undefined) return items;
    if (!page.nextToken) return items;
    nextToken = page.nextToken;
  }
}

/** Commander argParser for `--limit <n>`: a positive integer. */
export function parseLimit(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("--limit must be a positive integer.");
  }
  return n;
}

/** Page size to request: the user's limit, capped at the API's maximum. */
export function pageSizeFor(limit: number | undefined, apiMax: number): number | undefined {
  return limit === undefined ? undefined : Math.min(limit, apiMax);
}
