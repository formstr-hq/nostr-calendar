import { getDataLayer } from "@formstr/local-relay";
import { pingRelayViaWorker } from "../dataLayer/bootstrap";

export type ConnectionStatus = "untested" | "testing" | "ok" | "slow" | "error";

export interface RelayConnectionInfo {
  url: string;
  status: ConnectionStatus;
  latencyMs?: number;
  errorMessage?: string;
  lastTested?: number;
}

/**
 * Reads live connection health from the worker's RelayPool.
 * Does not open any sockets or trigger network activity.
 */
export async function fetchWorkerRelayHealth(): Promise<
  Record<string, RelayConnectionInfo>
> {
  try {
    const health = await getDataLayer().relayHealth();
    const result: Record<string, RelayConnectionInfo> = {};
    for (const h of health) {
      let status: ConnectionStatus;
      if (h.connected) {
        status = "ok";
      } else if (h.connecting || h.reconnecting) {
        status = "slow";
      } else {
        status = "error";
      }
      result[h.relay] = {
        url: h.relay,
        status,
        errorMessage: h.connected ? undefined : "Disconnected",
        lastTested: Date.now(),
      };
    }
    return result;
  } catch (err) {
    console.warn("Failed to query relay health from worker", err);
    return {};
  }
}

/**
 * Pings an individual relay URL through the local-relay Web Worker.
 * Preserves the architectural invariant that the main thread never opens a raw WebSocket.
 */
export async function testRelayConnection(
  url: string,
): Promise<RelayConnectionInfo> {
  try {
    const result = await pingRelayViaWorker(url);
    return {
      ...result,
      lastTested: Date.now(),
    };
  } catch (err) {
    return {
      url,
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Connection failed",
      lastTested: Date.now(),
    };
  }
}

/**
 * Tests an array of relay URLs in parallel via the local-relay Web Worker.
 * Calls `onProgress` as each relay finishes testing.
 */
export async function testAllRelayConnections(
  urls: string[],
  onProgress?: (info: RelayConnectionInfo) => void,
): Promise<RelayConnectionInfo[]> {
  const promises = urls.map(async (url) => {
    const info = await testRelayConnection(url);
    onProgress?.(info);
    return info;
  });
  return Promise.all(promises);
}
