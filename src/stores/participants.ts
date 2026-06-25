import { create } from "zustand";
import { fetchUserProfile } from "../common/nostr";

export interface IParticipant {
  publicKey: string;
  picture?: string;
  name?: string;
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
      const { name, picture } = JSON.parse(event.content) as {
        name: string;
        picture: string;
      };
      set(({ participants }) => ({
        participants: {
          ...participants,
          [participantPubKey]: {
            name,
            picture,
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
