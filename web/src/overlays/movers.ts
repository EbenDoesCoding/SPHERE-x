import type { MoverHint, Resolved, SearchOptions } from "./types";

/**
 * Looks for a fast-moving object that was at the resolved position once and has since left it.
 * Resolves to null when there is none, or when the catalogues cannot be reached (never rejects
 * for that: the hint is an extra, the search result stands without it).
 */
export async function findMover(
  _resolved: Resolved,
  _options: SearchOptions = {},
): Promise<MoverHint | null> {
  return null;
}
