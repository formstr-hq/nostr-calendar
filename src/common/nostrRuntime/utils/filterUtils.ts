import { Filter } from "nostr-tools";

/**
 * Normalize a filter for consistent hashing
 * - Sort object keys
 * - Sort array values
 * - Remove undefined values
 */
export function normalizeFilter(filter: Filter): Filter {
  const normalized: any = {};

  // Sort keys for consistent ordering
  const keys = Object.keys(filter).sort();

  for (const key of keys) {
    const value = (filter as any)[key];

    if (value === undefined) continue;

    // Sort arrays for consistent comparison
    if (Array.isArray(value)) {
      normalized[key] = [...value].sort();
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Generate a unique hash for a set of filters and relays
 * Used for subscription deduplication
 */
export function generateFilterHash(filter: Filter, relays: string[]): string {
  const normalizedFilter = normalizeFilter(filter);

  // Sort relays
  const sortedRelays = [...relays].sort();

  // Create deterministic string representation
  const hashInput = JSON.stringify({
    filter: normalizedFilter,
    relays: sortedRelays,
  });

  // Generate hash (use simple string hash for browser compatibility)
  return simpleHash(hashInput);
}

/**
 * Simple string hash function for browser environments
 * Returns a consistent hash string for any input
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Check if an event matches a filter
 * Used for local cache queries
 */
export function eventMatchesFilter(event: any, filter: Filter): boolean {
  // Check IDs
  if (filter.ids && !filter.ids.includes(event.id)) {
    return false;
  }

  // Check authors
  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }

  // Check kinds
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }

  // Check since (event must be >= since)
  if (filter.since && event.created_at < filter.since) {
    return false;
  }

  // Check until (event must be <= until)
  if (filter.until && event.created_at > filter.until) {
    return false;
  }

  // Check tags (#e, #p, etc.)
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("#")) {
      const tagName = key.slice(1);
      const requiredValues = value as string[];

      // Find matching tags
      const matchingTags = event.tags
        .filter((tag: string[]) => tag[0] === tagName)
        .map((tag: string[]) => tag[1]);

      // Event must have at least one matching tag value
      if (!requiredValues.some((v) => matchingTags.includes(v))) {
        return false;
      }
    }
  }

  // Check limit (we don't enforce this in matching, it's for query result limiting)

  return true;
}

/**
 * Chunk a large filter into multiple smaller filters
 * Used when filter has >1000 authors to avoid relay limits
 */
export function chunkFilter(
  filter: Filter,
  chunkSize: number = 1000,
): Filter[] {
  // If no authors or small author list, return as-is
  if (!filter.authors || filter.authors.length <= chunkSize) {
    return [filter];
  }

  // Split authors into chunks
  const chunks: Filter[] = [];
  for (let i = 0; i < filter.authors.length; i += chunkSize) {
    const authorChunk = filter.authors.slice(i, i + chunkSize);
    chunks.push({
      ...filter,
      authors: authorChunk,
    });
  }

  return chunks;
}

/**
 * Extract tag index keys from an event
 * Returns keys like "e:eventid" or "p:pubkey"
 */
export function extractTagKeys(event: any): string[] {
  const keys: string[] = [];

  for (const tag of event.tags || []) {
    if (tag.length >= 2) {
      const [tagName, tagValue] = tag;
      keys.push(`${tagName}:${tagValue}`);
    }
  }

  return keys;
}
