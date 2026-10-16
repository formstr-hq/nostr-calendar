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

interface WorkerScope {
  postMessage: (m: unknown) => void;
  onmessage: ((e: MessageEvent) => void) | null;
}

const workerScope = self as unknown as WorkerScope;

interface RelayPingResult {
  url: string;
  status: "ok" | "slow" | "error";
  latencyMs?: number;
  errorMessage?: string;
}

/**
 * Pings a relay within the worker to measure handshake latency on demand.
 * Keeps socket creation strictly inside the worker layer.
 */
function pingRelayInWorker(url: string): Promise<RelayPingResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;
    let ws: WebSocket;

    const timer = setTimeout(() => {
      settle({
        url,
        status: "error",
        errorMessage: "Connection timed out",
      });
    }, 5000);

    const settle = (result: RelayPingResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (ws) {
          ws.onopen = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        }
      } catch {
        // ignore
      }
      resolve(result);
    };

    try {
      ws = new WebSocket(url);
    } catch (err: unknown) {
      clearTimeout(timer);
      return resolve({
        url,
        status: "error",
        errorMessage:
          err instanceof Error ? err.message : "Invalid WebSocket URL",
      });
    }

    ws.onopen = () => {
      const latencyMs = Math.round(performance.now() - start);
      const status = latencyMs > 1200 ? "slow" : "ok";
      settle({ url, status, latencyMs });
    };

    ws.onerror = () => {
      settle({
        url,
        status: "error",
        errorMessage: "Connection failed",
      });
    };

    ws.onclose = (event) => {
      if (!settled) {
        settle({
          url,
          status: "error",
          errorMessage: event.reason || "Connection closed",
        });
      }
    };
  });
}

let serviceHandler: ((e: MessageEvent) => void) | null = null;

const scopedChannelScope: WorkerScope = {
  postMessage: (m) => workerScope.postMessage(m),
  get onmessage() {
    return serviceHandler;
  },
  set onmessage(handler) {
    serviceHandler = handler;
  },
};

const channel = selfChannel(scopedChannelScope);

workerScope.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (
    data &&
    typeof data === "object" &&
    (data as { kind?: string }).kind === "pingRelay"
  ) {
    const { reqId, url } = data as { reqId: string; url: string };
    const result = await pingRelayInWorker(url);
    workerScope.postMessage({ kind: "pingRelayResult", reqId, result });
    return;
  }
  serviceHandler?.(e);
};

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
