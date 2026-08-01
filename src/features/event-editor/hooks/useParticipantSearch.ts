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
    const exactNip05 = new Map<string, string>();
    const verification = new Map<string, boolean>();
    const verifying = new Set<string>();
    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const excluded = new Set(
      selectedParticipants.map((pubkey) => pubkey.toLowerCase()),
    );
    if (currentPubkey) excluded.add(currentPubkey.toLowerCase());

    const eligibleHistory = history.filter(
      ({ pubkey }) => !excluded.has(pubkey.toLowerCase()),
    );
    const matchedHistory = trimmedQuery
      ? eligibleHistory.filter(({ name, displayName }) =>
          [name, displayName].some((value) =>
            value?.toLowerCase().includes(normalizedQuery),
          ),
        )
      : eligibleHistory;
    const historyByPubkey = new Map(
      eligibleHistory.map((person) => [person.pubkey.toLowerCase(), person]),
    );

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
      const nip05 =
        exactNip05.get(pubkey) ?? (profile ? profile.nip05 : fallback?.nip05);
      if (nip05) verify(nip05, pubkey);
      return {
        pubkey,
        name: profile ? profile.name : fallback?.name,
        displayName: profile ? profile.displayName : fallback?.displayName,
        picture: profile ? profile.picture : fallback?.picture,
        nip05,
        isNip05Verified: nip05
          ? verification.get(`${nip05.trim().toLowerCase()}:${pubkey}`) === true
          : false,
        isPreviouslyMet: historyByPubkey.has(pubkey),
      };
    };

    function publish() {
      if (!active) return;
      const orderedPubkeys: string[] = [];
      const add = (pubkey: string) => {
        const normalized = pubkey.toLowerCase();
        if (!excluded.has(normalized) && !orderedPubkeys.includes(normalized)) {
          orderedPubkeys.push(normalized);
        }
      };
      matchedHistory.forEach(({ pubkey }) => add(pubkey));
      exactPubkeys.forEach(add);
      profiles.forEach((_profile, pubkey) => add(pubkey));
      setOptions(
        orderedPubkeys
          .slice(0, Math.max(0, limit))
          .map((pubkey) => toResult(pubkey, historyByPubkey.get(pubkey))),
      );
    }

    const onProfile = (profile: UserProfile) => {
      const pubkey = profile.pubkey.toLowerCase();
      if (!isNewer(profile, profiles.get(pubkey))) return;
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
    if (!trimmedQuery) {
      const historyPubkeys = eligibleHistory.map(({ pubkey }) => pubkey);
      if (historyPubkeys.length > 0) {
        handles.push(
          observeUserProfiles(historyPubkeys, {
            onProfile,
            onEose: () => {
              if (active) setLoading(false);
            },
          }),
        );
      } else {
        setLoading(false);
      }
      return cleanup;
    }

    const exactPubkey = decodeExactPubkey(trimmedQuery);
    if (exactPubkey) {
      exactPubkeys.push(exactPubkey);
      setLoading(false);
      publish();
      handles.push(observeUserProfiles([exactPubkey], { onProfile }));
      return cleanup;
    }

    setLoading(true);
    const debounceTimer = setTimeout(() => {
      if (!active) return;

      handles.push(
        observeProfileSearch(trimmedQuery, {
          onProfile,
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
              onProfile,
            }),
          );
        });
      }
    }, 100);

    return () => {
      clearTimeout(debounceTimer);
      cleanup();
    };
  }, [currentPubkey, history, limit, query, selectedParticipants]);

  return { options, loading, error };
}
