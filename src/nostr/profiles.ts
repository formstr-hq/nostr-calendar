import { dataLayer, type ObserveHandle } from "@formstr/local-relay";
import { Event } from "nostr-tools";
import { EventKinds } from "./kinds";
import { fetchLatest } from "./fetch";

export interface UserProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  createdAt: number;
  eventId: string;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Parse untrusted kind-0 content without allowing malformed metadata to escape. */
export function parseUserProfile(event: Event): UserProfile | null {
  if (event.kind !== EventKinds.UserProfile) return null;

  try {
    const content: unknown = JSON.parse(event.content);
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return null;
    }

    const metadata = content as Record<string, unknown>;
    return {
      pubkey: event.pubkey.toLowerCase(),
      name: optionalString(metadata.name) ?? optionalString(metadata.username),
      displayName:
        optionalString(metadata.display_name) ??
        optionalString(metadata.displayName) ??
        optionalString(metadata["display-name"]),
      picture: optionalString(metadata.picture),
      nip05: optionalString(metadata.nip05),
      createdAt: event.created_at,
      eventId: event.id,
    };
  } catch {
    return null;
  }
}

export const fetchUserProfile = async (
  pubkey: string,
): Promise<Event | null> => {
  return fetchLatest([
    { kinds: [EventKinds.UserProfile], authors: [pubkey], limit: 1 },
  ]);
};

interface ProfileStreamHandlers {
  onProfile: (profile: UserProfile) => void;
  onEose?: () => void;
}

function observeProfileFilters(
  filters: Parameters<typeof dataLayer.observe>[0],
  handlers: ProfileStreamHandlers,
): ObserveHandle {
  return dataLayer.observe(filters, {
    onEvent: (event) => {
      const profile = parseUserProfile(event);
      if (profile) handlers.onProfile(profile);
    },
    onEose: handlers.onEose,
  });
}

/** Declare a live NIP-50 profile search interest. */
export function observeProfileSearch(
  query: string,
  handlers: ProfileStreamHandlers,
): ObserveHandle {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return observeProfileFilters(
    [{ kinds: [EventKinds.UserProfile], search: query, limit: 10 }],
    {
      ...handlers,
      onProfile: (profile) => {
        const searchable = [profile.name, profile.displayName, profile.nip05]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (terms.every((term) => searchable.includes(term))) {
          handlers.onProfile(profile);
        }
      },
    },
  );
}

export function observeUserProfiles(
  pubkeys: string[],
  handlers: ProfileStreamHandlers,
): ObserveHandle {
  return observeProfileFilters(
    [
      {
        kinds: [EventKinds.UserProfile],
        authors: pubkeys.map((pubkey) => pubkey.toLowerCase()),
      },
    ],
    handlers,
  );
}
