import { Event } from "nostr-tools";

export const getDTag = (event: Event) => {
  const tag = event.tags.find((tag) => tag[0] === "d");
  if (tag && tag[1]) {
    return tag[1];
  }
  return null;
};
