import { type Resolved, SearchError, type SearchOptions } from "./types";

/** True when a team backend address is configured, so names can be looked up. */
export const NAME_LOOKUP_AVAILABLE = false;

/** The hint under the search field: only the forms that work in this build. */
export const SEARCH_HINT = "Try 133.7599 -7.2418.";

/**
 * Reads an entry: decimal degrees, hours and degrees, or a name.
 * Rejects with a SearchError whose message names the problem and the allowed range.
 */
export async function resolveQuery(_text: string, _options: SearchOptions = {}): Promise<Resolved> {
  throw new SearchError("unavailable", "Search is not built yet.");
}
