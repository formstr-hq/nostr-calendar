import { useEffect, useEffectEvent, useState } from "react";
import { nip19 } from "nostr-tools";
import {
  observeProfileSearch,
  observeUserProfiles,
  type UserProfile,
} from "../../../nostr/profiles";
import {
  isNip05Identifier,
  resolveNip05,
  verifyNip05,
} from "../../../nostr/nip05";
import { useAuthorContacts } from "./useAuthorContacts";

export interface ParticipantHistoryRecord {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
}

export interface ParticipantSearchResult extends ParticipantHistoryRecord {
  isNip05Verified: boolean;
  isPreviouslyMet: boolean;
  isContact: boolean;
  isSelected: boolean;
}

export interface UseParticipantSearchInput {
  query: string;
  selectedParticipants: readonly string[];
  currentPubkey?: string | null;
  history: readonly ParticipantHistoryRecord[];
  onProfileResolved?: (profile: UserProfile) => void;
  limit?: number;
}

export interface UseParticipantSearchResult {
  options: ParticipantSearchResult[];
  loading: boolean;
  error: Error | null;
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

function decodeExactPubkey(query: string): string | null {
  if (HEX_PUBKEY.test(query)) return query.toLowerCase();
  if (!query.toLowerCase().startsWith("npub1")) return null;

  try {
    const decoded = nip19.decode(query);
    return decoded.type === "npub" ? decoded.data.toLowerCase() : null;
  } catch {
    return null;
  }
}

function isNewer(candidate: UserProfile, current?: UserProfile): boolean {
  return (
    !current ||
    candidate.createdAt > current.createdAt ||
    (candidate.createdAt === current.createdAt &&
      candidate.eventId > current.eventId)
  );
}

export function useParticipantSearch({
  query,
  selectedParticipants,
  currentPubkey,
  history,
  onProfileResolved,
  limit = 10,
}: UseParticipantSearchInput): UseParticipantSearchResult {
  const contacts = useAuthorContacts(currentPubkey);
  const [options, setOptions] = useState<ParticipantSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const notifyProfileResolved = useEffectEvent((profile: UserProfile) => {
    onProfileResolved?.(profile);
  });

  useEffect(() => {
    let active = true;
    const handles: Array<{ unobserve: () => void }> = [];
    let stopLoading: ReturnType<typeof setTimeout> | undefined;
    const profiles = new Map<string, UserProfile>();
    const exactPubkeys: string[] = [];
    const discoveredPubkeys = new Set<string>();
    const exactNip05 = new Map<string, string>();
    const verification = new Map<string, boolean>();
    const verifying = new Set<string>();
    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const selected = new Set(
      selectedParticipants.map((pubkey) => pubkey.toLowerCase()),
    );
    const excluded = new Set<string>();
    if (currentPubkey) excluded.add(currentPubkey.toLowerCase());

    const eligibleHistory = history.filter(
      ({ pubkey }) =>
        !excluded.has(pubkey.toLowerCase()) &&
        !selected.has(pubkey.toLowerCase()),
    );
    const historyByPubkey = new Map(
      history.map((person) => [person.pubkey.toLowerCase(), person]),
    );
    const eligibleContacts = contacts.filter(
      ({ pubkey }) =>
        !excluded.has(pubkey.toLowerCase()) &&
        !selected.has(pubkey.toLowerCase()),
    );
    const contactsByPubkey = new Map(
      contacts.map((contact) => [contact.pubkey.toLowerCase(), contact]),
    );

    const matchesLocalCandidate = (
      pubkey: string,
      fallback?: ParticipantHistoryRecord,
    ) => {
      if (!trimmedQuery) return true;
      const profile = profiles.get(pubkey);
      const contact = contactsByPubkey.get(pubkey);
      return [
        profile?.name,
        profile?.displayName,
        profile?.nip05,
        fallback?.name,
        fallback?.displayName,
        fallback?.nip05,
        contact?.petname,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    };

    const sortName = (pubkey: string): string | null => {
      const profile = profiles.get(pubkey);
      const historyRecord = historyByPubkey.get(pubkey);
      const contact = contactsByPubkey.get(pubkey);
      return (
        profile?.displayName ??
        profile?.name ??
        historyRecord?.displayName ??
        historyRecord?.name ??
        contact?.petname ??
        null
      );
    };

    const verify = (nip05: string, pubkey: string) => {
      const key = `${nip05.trim().toLowerCase()}:${pubkey}`;
      if (verification.has(key) || verifying.has(key)) return;
      verifying.add(key);
      void verifyNip05(nip05, pubkey).then((verified) => {
        if (!active) return;
        verifying.delete(key);
        verification.set(key, verified);
        publish();
      });
    };

    const toResult = (
      pubkey: string,
      fallback?: ParticipantHistoryRecord,
    ): ParticipantSearchResult => {
      const profile = profiles.get(pubkey);
      const contact = contactsByPubkey.get(pubkey);
      const nip05 =
        exactNip05.get(pubkey) ?? (profile ? profile.nip05 : fallback?.nip05);
      if (nip05) verify(nip05, pubkey);
      return {
        pubkey,
        name: profile?.name ?? fallback?.name ?? contact?.petname,
        displayName: profile?.displayName ?? fallback?.displayName,
        picture: profile?.picture ?? fallback?.picture,
        nip05,
        isNip05Verified: nip05
          ? verification.get(`${nip05.trim().toLowerCase()}:${pubkey}`) === true
          : false,
        isPreviouslyMet: historyByPubkey.has(pubkey),
        isContact: contactsByPubkey.has(pubkey),
        isSelected: selected.has(pubkey),
      };
    };

    function publish() {
      if (!active) return;
      const orderedPubkeys: string[] = [];
      const addedPubkeys = new Set<string>();
      const add = (pubkey: string) => {
        const normalized = pubkey.toLowerCase();
        if (
          !excluded.has(normalized) &&
          !selected.has(normalized) &&
          !addedPubkeys.has(normalized)
        ) {
          addedPubkeys.add(normalized);
          orderedPubkeys.push(normalized);
        }
      };
      eligibleHistory.forEach((person) => {
        const pubkey = person.pubkey.toLowerCase();
        if (matchesLocalCandidate(pubkey, person)) add(pubkey);
      });
      eligibleContacts.forEach((contact) => {
        const pubkey = contact.pubkey.toLowerCase();
        if (matchesLocalCandidate(pubkey, historyByPubkey.get(pubkey))) {
          add(pubkey);
        }
      });
      exactPubkeys.forEach(add);
      discoveredPubkeys.forEach(add);
      // With no query, present the combined contact/history list sorted by
      // name (people with a known name first). Once the user types, relay
      // search results are shown in the order they were discovered.
      if (!trimmedQuery) {
        orderedPubkeys.sort((left, right) => {
          const leftName = sortName(left);
          const rightName = sortName(right);
          if (leftName && !rightName) return -1;
          if (!leftName && rightName) return 1;
          if (leftName && rightName) {
            return leftName.localeCompare(rightName, undefined, {
              sensitivity: "base",
            });
          }
          return 0;
        });
      }
      const matchingSelected = selectedParticipants
        .map((pubkey) => pubkey.toLowerCase())
        .filter(
          (pubkey, index, pubkeys) =>
            !excluded.has(pubkey) &&
            pubkeys.indexOf(pubkey) === index &&
            (exactPubkeys.includes(pubkey) ||
              discoveredPubkeys.has(pubkey) ||
              matchesLocalCandidate(pubkey, historyByPubkey.get(pubkey))),
        );
      setOptions(
        [
          ...orderedPubkeys.slice(0, Math.max(0, limit)),
          ...matchingSelected,
        ].map((pubkey) => toResult(pubkey, historyByPubkey.get(pubkey))),
      );
    }

    const onProfile = (profile: UserProfile, discovered = false) => {
      const pubkey = profile.pubkey.toLowerCase();
      const newlyDiscovered = discovered && !discoveredPubkeys.has(pubkey);
      if (discovered) discoveredPubkeys.add(pubkey);
      if (!isNewer(profile, profiles.get(pubkey))) {
        if (newlyDiscovered) publish();
        return;
      }
      profiles.set(pubkey, profile);
      notifyProfileResolved(profile);
      setLoading(false);
      publish();
    };

    const cleanup = () => {
      active = false;
      if (stopLoading) clearTimeout(stopLoading);
      handles.forEach((handle) => handle.unobserve());
    };

    publish();
    setError(null);
    const localCandidatePubkeys = Array.from(
      new Set([
        ...eligibleHistory.map(({ pubkey }) => pubkey.toLowerCase()),
        ...eligibleContacts.map(({ pubkey }) => pubkey.toLowerCase()),
        ...(trimmedQuery
          ? selectedParticipants.map((pubkey) => pubkey.toLowerCase())
          : []),
      ]),
    ).filter((pubkey) => !excluded.has(pubkey));
    if (localCandidatePubkeys.length > 0) {
      handles.push(
        observeUserProfiles(localCandidatePubkeys, {
          onProfile: (profile) => onProfile(profile),
        }),
      );
    }
    if (!trimmedQuery) {
      setLoading(false);
      return cleanup;
    }

    const exactPubkey = decodeExactPubkey(trimmedQuery);
    if (exactPubkey) {
      exactPubkeys.push(exactPubkey);
      setLoading(false);
      publish();
      handles.push(
        observeUserProfiles([exactPubkey], {
          onProfile: (profile) => onProfile(profile),
        }),
      );
      return cleanup;
    }

    setLoading(true);
    const debounceTimer = setTimeout(() => {
      if (!active) return;

      handles.push(
        observeProfileSearch(trimmedQuery, {
          onProfile: (profile) => onProfile(profile, true),
        }),
      );
      stopLoading = setTimeout(() => {
        if (active) setLoading(false);
      }, 4000);

      if (isNip05Identifier(trimmedQuery)) {
        void resolveNip05(trimmedQuery).then((resolved) => {
          if (!active) return;
          if (!resolved) {
            setError(new Error("Unable to resolve NIP-05 identifier"));
            setLoading(false);
            return;
          }
          exactPubkeys.push(resolved);
          exactNip05.set(resolved, trimmedQuery);
          verification.set(`${normalizedQuery}:${resolved}`, true);
          setLoading(false);
          publish();
          handles.push(
            observeUserProfiles([resolved], {
              onProfile: (profile) => onProfile(profile),
            }),
          );
        });
      }
    }, 100);

    return () => {
      clearTimeout(debounceTimer);
      cleanup();
    };
  }, [contacts, currentPubkey, history, limit, query, selectedParticipants]);

  return { options, loading, error };
}
