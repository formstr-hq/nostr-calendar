import { create } from "zustand";
import {
  deleteParticipantHistoryDatabase,
  loadParticipantHistory,
  upsertParticipantHistory,
  type ParticipantHistoryRecord,
} from "../storage/participantHistoryDb";
import type { ICalendarEvent } from "../utils/types";

export interface ParticipantHistorySeed {
  participantPubkey: string;
  firstInteractionAt: number;
}

type ProfileSnapshot = Pick<
  ParticipantHistoryRecord,
  "name" | "displayName" | "picture" | "nip05" | "profileCreatedAt"
>;

const normalizePubkey = (pubkey: string): string => pubkey.trim().toLowerCase();

export const deriveParticipantHistory = (
  events: ICalendarEvent[],
  accountPubkey: string,
): ParticipantHistorySeed[] => {
  const account = normalizePubkey(accountPubkey);
  const participants = new Map<string, number>();

  for (const event of events) {
    const author = normalizePubkey(event.user);
    const eventParticipants = event.participants.map(normalizePubkey);
    const isAccountEvent =
      event.isPrivateEvent ||
      author === account ||
      eventParticipants.includes(account);
    if (!isAccountEvent) continue;

    const interactionAt =
      Number.isFinite(event.createdAt) && event.createdAt > 0
        ? event.createdAt * 1000
        : Date.now();
    for (const pubkey of [author, ...eventParticipants]) {
      const normalized = normalizePubkey(pubkey);
      if (!normalized || normalized === account) continue;
      participants.set(
        normalized,
        Math.min(participants.get(normalized) ?? interactionAt, interactionAt),
      );
    }
  }

  return Array.from(
    participants,
    ([participantPubkey, firstInteractionAt]) => ({
      participantPubkey,
      firstInteractionAt,
    }),
  );
};

interface ParticipantHistoryState {
  accountPubkey: string | null;
  participants: Record<string, ParticipantHistoryRecord>;
  initializeAccount: (accountPubkey: string) => Promise<void>;
  recordEvents: (accountPubkey: string, events: ICalendarEvent[]) => void;
  updateProfileSnapshot: (
    accountPubkey: string | null,
    participantPubkey: string,
    snapshot: ProfileSnapshot,
  ) => void;
  wipe: () => Promise<void>;
}

let accountGeneration = 0;

export const useParticipantHistory = create<ParticipantHistoryState>(
  (set, get) => ({
    accountPubkey: null,
    participants: {},
    initializeAccount: async (accountPubkey) => {
      const normalizedAccount = normalizePubkey(accountPubkey);
      const generation = ++accountGeneration;
      set({ accountPubkey: normalizedAccount, participants: {} });

      try {
        const records = await loadParticipantHistory(normalizedAccount);
        if (
          generation !== accountGeneration ||
          get().accountPubkey !== normalizedAccount
        )
          return;
        set(({ participants }) => ({
          participants: {
            ...Object.fromEntries(
              records.map((record) => [record.participantPubkey, record]),
            ),
            ...participants,
          },
        }));
      } catch (error) {
        console.warn("Failed to load participant history", error);
      }
    },
    recordEvents: (accountPubkey, events) => {
      const normalizedAccount = normalizePubkey(accountPubkey);
      if (get().accountPubkey !== normalizedAccount) return;
      const records = deriveParticipantHistory(events, normalizedAccount).map(
        (seed) => ({ accountPubkey: normalizedAccount, ...seed }),
      );
      if (records.length === 0) return;

      set(({ participants }) => {
        const updated = { ...participants };
        for (const record of records) {
          const existing = updated[record.participantPubkey];
          updated[record.participantPubkey] = {
            ...record,
            ...existing,
            firstInteractionAt: Math.min(
              existing?.firstInteractionAt ?? record.firstInteractionAt,
              record.firstInteractionAt,
            ),
          };
        }
        return { participants: updated };
      });
      void upsertParticipantHistory(records).catch((error) =>
        console.warn("Failed to persist participant history", error),
      );
    },
    updateProfileSnapshot: (accountPubkey, participantPubkey, snapshot) => {
      const normalizedAccount = accountPubkey
        ? normalizePubkey(accountPubkey)
        : null;
      if (!normalizedAccount || get().accountPubkey !== normalizedAccount) {
        return;
      }
      const normalizedParticipant = normalizePubkey(participantPubkey);
      const existing = get().participants[normalizedParticipant];
      if (!existing) return;
      if (
        snapshot.profileCreatedAt !== undefined &&
        existing.profileCreatedAt !== undefined &&
        snapshot.profileCreatedAt <= existing.profileCreatedAt
      ) {
        return;
      }
      const updated = { ...existing, ...snapshot };
      set(({ participants }) => ({
        participants: { ...participants, [normalizedParticipant]: updated },
      }));
      void upsertParticipantHistory([updated]).catch((error) =>
        console.warn("Failed to persist participant profile snapshot", error),
      );
    },
    wipe: async () => {
      ++accountGeneration;
      set({ accountPubkey: null, participants: {} });
      await deleteParticipantHistoryDatabase();
    },
  }),
);
