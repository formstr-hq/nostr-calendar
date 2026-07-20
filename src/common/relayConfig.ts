import { useRelayStore } from "../stores/relays";

/**
 * Relay configuration — a ROUTING-POLICY INPUT for the local-relay worker, not
 * a connection target. The app never opens a socket; bootstrap feeds this list
 * to the worker via `setUserRelays` and the worker decides every connection.
 */
export const defaultRelays = import.meta.env.VITE_TEST_RELAY
  ? [import.meta.env.VITE_TEST_RELAY as string]
  : [
      "wss://relay.damus.io/",
      "wss://relay.primal.net/",
      "wss://nos.lol",
      "wss://relay.nostr.wirednet.jp/",
      "wss://nostr-01.yakihonne.com",
      "wss://relay.snort.social",
      "wss://nostr21.com",
    ];

/** The user's configured relays, falling back to the defaults. */
export const getRelays = (): string[] => {
  const userRelays = useRelayStore.getState().relays;
  return userRelays.length > 0 ? userRelays : defaultRelays;
};
