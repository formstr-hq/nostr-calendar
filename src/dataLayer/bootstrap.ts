import {
  DataLayer,
  LocalRelayClient,
  workerChannel,
  getDataLayer,
  setDataLayer,
  type Channel,
  type Event,
} from "@formstr/local-relay";
import type { EventTemplate } from "nostr-tools";
import { signerManager } from "../common/signer";
import { getRelays } from "../common/relayConfig";
import { useRelayStore } from "../stores/relays";
import { notifyRelayRefresh } from "./relayRefresh";
import { withLegacyTombstones } from "./legacyTombstones";
import { withResilientObserve } from "./resilientObserve";

/**
 * Browser bootstrap for the DataLayer — the only place that touches platform
 * globals (Worker, document) and the app's signer. Spawns the relay worker,
 * wires NIP-42 AUTH signing to `signerManager`, tracks the active account,
 * feeds the user's relay list as a routing-policy input, and pauses/resumes
 * upstream sockets on page visibility. The worker owns every connection.
 */

// The published package names its IndexedDB database
// `pollerama-local-relay:<namespace>`; our worker uses namespace "nostr-calendar".
const RELAY_DB_NAME = "pollerama-local-relay:nostr-calendar";

let started = false;
let worker: Worker | null = null;
let client: LocalRelayClient | null = null;
let disposeResilient: (() => void) | null = null;

const applyUserRelays = () => client?.setUserRelays(getRelays());

const applyAccount = () =>
  getDataLayer().setActiveAccount(signerManager.getUser()?.pubkey ?? null);

const sign = async (template: EventTemplate): Promise<Event> => {
  const signer = await signerManager.getSigner();
  return (await signer.signEvent(template)) as Event;
};

/** Spawn the worker and install a fresh DataLayer singleton around it. */
function spawn(): void {
  worker = new Worker(new URL("./relay.worker.ts", import.meta.url), {
    type: "module",
  });
  const base = workerChannel(worker);

  // Watch the worker boundary for moments when it can newly serve cached data:
  // `hydrated` (IndexedDB load finished — interests declared during boot EOSE'd
  // on an empty store and missed it) and a repeat `ready` (a worker restart that
  // dropped its in-memory interests). Both bump the refresh signal so
  // resilientObserve re-declares every live interest. Unknown frames pass
  // straight through to the client, which ignores them.
  let readyCount = 0;
  const channel: Channel = {
    post: (m) => base.post(m),
    close: () => base.close(),
    onMessage: (handler) =>
      base.onMessage((m) => {
        const kind = (m as { kind?: string } | null)?.kind;
        if (kind === "hydrated") {
          notifyRelayRefresh();
        } else if (kind === "ready") {
          readyCount += 1;
          if (readyCount > 1) notifyRelayRefresh(); // restart, not first boot
        }
        handler(m);
      }),
  };

  client = new LocalRelayClient(channel, {
    // The worker asks us to sign NIP-42 AUTH challenges; route to the signer.
    onSignRequest: async (template) => {
      try {
        return await sign(template);
      } catch {
        return null; // refuse → worker treats the relay as auth-failed
      }
    },
  });
  applyUserRelays();

  const resilient = withResilientObserve(new DataLayer({ client, sign }));
  disposeResilient = resilient.dispose;
  setDataLayer(withLegacyTombstones(resilient.dataLayer));
  applyAccount();
}

/** Idempotent: spawns the worker + wires the DataLayer once, returns the singleton. */
export function bootstrapDataLayer(): DataLayer {
  if (started) return getDataLayer();
  started = true;

  spawn();

  // Routing-policy inputs stay current: relay-list edits and account switches.
  useRelayStore.subscribe(applyUserRelays);
  signerManager.onChange(applyAccount);

  // Lifecycle: drop all sockets when hidden/leaving, reconnect syncs on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") getDataLayer().pause();
    else getDataLayer().resume();
  });
  window.addEventListener("pagehide", () => getDataLayer().pause());

  return getDataLayer();
}

/**
 * Logout: kill the worker, wipe its IndexedDB event cache, and install a fresh
 * DataLayer around a new worker. Callers must have unobserved their handles —
 * old ones are dead after this.
 */
export async function restartDataLayerWiped(): Promise<void> {
  disposeResilient?.();
  disposeResilient = null;
  worker?.terminate(); // closes every worker-owned socket with it
  worker = null;
  client = null;

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(RELAY_DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });

  spawn();
  notifyRelayRefresh();
}
