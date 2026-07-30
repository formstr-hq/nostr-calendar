import { create } from "zustand";
import { fetchUserProfile } from "../nostr/profiles";

export interface IParticipant {
  publicKey: string;
  picture?: string;
  name?: string;
  /** Profile-declared NIP-05 identifier; callers must verify it before trust. */
  nip05?: string;
  createdAt?: number;
  fetching: boolean;
}

export const useParticipants = create<{
  participants: Record<string, IParticipant>;
  fetchParticipant: (participant: IParticipant["publicKey"]) => void;
}>((set) => ({
  participants: {},
  fetchParticipant: async (participantPubKey) => {
    set(({ participants }) => ({
      participants: {
        ...participants,
        [participantPubKey]: {
          publicKey: participantPubKey,
          fetching: true,
        },
      },
    }));

    const event = await fetchUserProfile(participantPubKey);

    if (event) {
      const { name, picture, nip05 } = JSON.parse(event.content) as {
        name: string;
        picture: string;
        nip05?: string;
      };
      set(({ participants }) => ({
        participants: {
          ...participants,
          [participantPubKey]: {
            name,
            picture,
            nip05,
            publicKey: event.pubkey,
            createdAt: event.created_at,
            fetching: false,
          },
        },
      }));
    } else {
      set(({ participants }) => ({
        participants: {
          ...participants,
          [participantPubKey]: {
            publicKey: participantPubKey,
            fetching: false,
          },
        },
      }));
    }
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
