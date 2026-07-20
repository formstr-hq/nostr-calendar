// Runs as a module Worker. No webworker lib reference — pulling it into the
// program clashes with the DOM lib the app compiles against; the one worker
// global we need (`self`) is cast structurally below.
import {
  RelayService,
  selfChannel,
  IndexedDBStorage,
  defaultPrunePolicy,
} from "@formstr/local-relay";
import { EventKinds } from "../nostr/kinds";

// The calendar is offline-first: every domain kind the app publishes or renders
// must survive pruning, or a user's own events would silently vanish from the
// local cache after the default 7-day TTL. Protecting the whole EventKinds enum
// means a kind added to nostr/kinds.ts is automatically retained.
const prunePolicy = defaultPrunePolicy();
for (const kind of Object.values(EventKinds)) {
  if (typeof kind === "number") prunePolicy.protectedKinds.add(kind);
}

const channel = selfChannel(
  self as unknown as {
    postMessage: (m: unknown) => void;
    onmessage: ((e: MessageEvent) => void) | null;
  },
);

const service = new RelayService({
  channel,
  storage: new IndexedDBStorage("nostr-calendar"),
  persistence: { prunePolicy },
});

void service.start().then(() => {
  // Interests declared before hydration EOSE'd on an empty store; this frame
  // tells the main thread to re-declare them against the loaded cache.
  channel.post({ kind: "hydrated" });
});

export {};
