import { create } from "zustand";
import { fetchUserProfile, parseUserProfile } from "../nostr/profiles";
import { useParticipantHistory } from "./participantHistory";

export interface IParticipant {
  publicKey: string;
  picture?: string;
  name?: string;
  displayName?: string;
  /** Profile-declared NIP-05 identifier; callers must verify it before trust. */
  nip05?: string;
  createdAt?: number;
  fetching: boolean;
}

let participantGeneration = 0;

export const useParticipants = create<{
  participants: Record<string, IParticipant>;
  fetchParticipant: (participant: IParticipant["publicKey"]) => void;
  clearParticipants: () => void;
}>((set) => ({
  participants: {},
  fetchParticipant: async (participantPubKey) => {
    const generation = participantGeneration;
    const accountPubkey = useParticipantHistory.getState().accountPubkey;
    set(({ participants }) => ({
      participants: {
        ...participants,
        [participantPubKey]: {
          publicKey: participantPubKey,
          fetching: true,
        },
      },
    }));

    try {
      const event = await fetchUserProfile(participantPubKey);
      if (generation !== participantGeneration) return;
      const profile = event ? parseUserProfile(event) : null;
      if (!profile) return;

      set(({ participants }) => ({
        participants: {
          ...participants,
          [participantPubKey]: {
            name: profile.name,
            displayName: profile.displayName,
            picture: profile.picture,
            nip05: profile.nip05,
            publicKey: profile.pubkey,
            createdAt: profile.createdAt,
            fetching: false,
          },
        },
      }));
      useParticipantHistory
        .getState()
        .updateProfileSnapshot(accountPubkey, participantPubKey, {
          name: profile.name,
          displayName: profile.displayName,
          picture: profile.picture,
          nip05: profile.nip05,
          profileCreatedAt: profile.createdAt,
        });
    } catch {
      // A profile miss or relay failure leaves the participant as pubkey-only.
    } finally {
      if (generation === participantGeneration) {
        set(({ participants }) => ({
          participants: {
            ...participants,
            [participantPubKey]: {
              ...participants[participantPubKey],
              publicKey: participantPubKey,
              fetching: false,
            },
          },
        }));
      }
    }
  },
  clearParticipants: () => {
    participantGeneration += 1;
    set({ participants: {} });
  },
}));

export const useGetParticipant = ({ pubKey }: { pubKey: string }) => {
  const { participants, fetchParticipant } = useParticipants((state) => state);
  const isParticipantInCache = !!participants[pubKey];
  if (!isParticipantInCache) {
    fetchParticipant(pubKey);
  }
  return {
    participant: participants[pubKey] ?? { publicKey: pubKey },
    loading: participants[pubKey]?.fetching ?? true,
  };
};
