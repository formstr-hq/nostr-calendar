export type ConnectionStatus = "untested" | "testing" | "ok" | "slow" | "error";

export interface RelayConnectionInfo {
  url: string;
  status: ConnectionStatus;
  latencyMs?: number;
  errorMessage?: string;
  lastTested?: number;
}

/** Threshold in milliseconds to flag a relay connection as slow (yellow) */
export const SLOW_THRESHOLD_MS = 1200;

/** Timeout in milliseconds for relay connection attempt */
export const CONNECT_TIMEOUT_MS = 5000;

/**
 * Tests connection to a single Nostr relay URL by opening a WebSocket.
 * - Resolves with status "ok" (green) if connection opens under SLOW_THRESHOLD_MS.
 * - Resolves with status "slow" (yellow) if connection opens but exceeds SLOW_THRESHOLD_MS.
 * - Resolves with status "error" (red) if connection fails, closes with error, or times out.
 */
export function testRelayConnection(url: string): Promise<RelayConnectionInfo> {
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;
    let ws: WebSocket;

    const timer = setTimeout(() => {
      settle({
        url,
        status: "error",
        errorMessage: "Connection timed out",
        lastTested: Date.now(),
      });
    }, CONNECT_TIMEOUT_MS);

    const settle = (result: RelayConnectionInfo) => {
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
        // ignore close error
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
        lastTested: Date.now(),
      });
    }

    ws.onopen = () => {
      const latencyMs = Math.round(performance.now() - start);
      const status: ConnectionStatus =
        latencyMs > SLOW_THRESHOLD_MS ? "slow" : "ok";
      settle({
        url,
        status,
        latencyMs,
        lastTested: Date.now(),
      });
    };

    ws.onerror = () => {
      settle({
        url,
        status: "error",
        errorMessage: "Connection failed",
        lastTested: Date.now(),
      });
    };

    ws.onclose = (event) => {
      if (!settled) {
        settle({
          url,
          status: "error",
          errorMessage: event.reason || "Connection closed",
          lastTested: Date.now(),
        });
      }
    };
  });
}

/**
 * Tests an array of relay URLs in parallel.
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
