import { useCallback } from "react";
import {
  fetchWorkerRelayHealth,
  testRelayConnection,
  testAllRelayConnections,
  type RelayConnectionInfo,
} from "../../../nostr/relayConnection";
import { useRelayStore } from "../../../stores/relays";

/**
 * Hook to execute connection tests for individual relays or all relays,
 * and sync live connection state from the local-relay worker.
 */
export function useRelayConnectionTest() {
  const connectionStatuses = useRelayStore((s) => s.connectionStatuses);
  const isTestingAll = useRelayStore((s) => s.isTestingAll);
  const setConnectionStatus = useRelayStore((s) => s.setConnectionStatus);
  const removeConnectionStatus = useRelayStore((s) => s.removeConnectionStatus);
  const setAllConnectionStatuses = useRelayStore(
    (s) => s.setAllConnectionStatuses,
  );
  const setIsTestingAll = useRelayStore((s) => s.setIsTestingAll);

  /**
   * Syncs with the worker's existing connection pool state.
   * Read-only; opens zero new sockets.
   */
  const syncWorkerHealth = useCallback(async () => {
    const healthMap = await fetchWorkerRelayHealth();
    if (Object.keys(healthMap).length > 0) {
      setAllConnectionStatuses(healthMap);
    }
  }, [setAllConnectionStatuses]);

  const testSingleRelay = useCallback(
    async (url: string): Promise<RelayConnectionInfo> => {
      setConnectionStatus(url, { url, status: "testing" });
      try {
        const result = await testRelayConnection(url);
        setConnectionStatus(url, result);
        return result;
      } catch (error) {
        const fallback: RelayConnectionInfo = {
          url,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Test failed",
          lastTested: Date.now(),
        };
        setConnectionStatus(url, fallback);
        return fallback;
      }
    },
    [setConnectionStatus],
  );

  const testAllRelays = useCallback(
    async (relays: string[]) => {
      if (!relays.length) return;
      setIsTestingAll(true);

      // Immediately set all to "testing"
      const testingMap: Record<string, RelayConnectionInfo> = {};
      for (const url of relays) {
        testingMap[url] = { url, status: "testing" };
      }
      setAllConnectionStatuses(testingMap);

      try {
        // Run tests in parallel via worker, updating each as it finishes
        await testAllRelayConnections(relays, (info) => {
          setConnectionStatus(info.url, info);
        });
      } catch (error) {
        console.error("Failed to test all relay connections:", error);
      } finally {
        // Ensure no relay is left stuck in "testing" state if an error aborted early
        const currentStatuses = useRelayStore.getState().connectionStatuses;
        const lingeringErrors: Record<string, RelayConnectionInfo> = {};
        for (const url of relays) {
          if (currentStatuses[url]?.status === "testing") {
            lingeringErrors[url] = {
              url,
              status: "error",
              errorMessage: "Test interrupted",
              lastTested: Date.now(),
            };
          }
        }
        if (Object.keys(lingeringErrors).length > 0) {
          setAllConnectionStatuses(lingeringErrors);
        }
        setIsTestingAll(false);
      }
    },
    [setAllConnectionStatuses, setConnectionStatus, setIsTestingAll],
  );

  const getStatus = useCallback(
    (url: string): RelayConnectionInfo => {
      return connectionStatuses[url] ?? { url, status: "untested" };
    },
    [connectionStatuses],
  );

  return {
    connectionStatuses,
    isTestingAll,
    syncWorkerHealth,
    testSingleRelay,
    testAllRelays,
    getStatus,
    removeConnectionStatus,
  };
}
