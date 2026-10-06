import { useCallback } from "react";
import {
  testRelayConnection,
  testAllRelayConnections,
  type RelayConnectionInfo,
} from "../../../nostr/relayConnection";
import { useRelayStore } from "../../../stores/relays";

/**
 * Hook to execute connection tests for individual relays or all relays,
 * keeping the results persisted in `useRelayStore`.
 */
export function useRelayConnectionTest() {
  const connectionStatuses = useRelayStore((s) => s.connectionStatuses);
  const isTestingAll = useRelayStore((s) => s.isTestingAll);
  const setConnectionStatus = useRelayStore((s) => s.setConnectionStatus);
  const setAllConnectionStatuses = useRelayStore(
    (s) => s.setAllConnectionStatuses,
  );
  const setIsTestingAll = useRelayStore((s) => s.setIsTestingAll);

  const testSingleRelay = useCallback(
    async (url: string): Promise<RelayConnectionInfo> => {
      setConnectionStatus(url, { url, status: "testing" });
      const result = await testRelayConnection(url);
      setConnectionStatus(url, result);
      return result;
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

      // Run tests in parallel, updating each as it finishes
      await testAllRelayConnections(relays, (info) => {
        setConnectionStatus(info.url, info);
      });

      setIsTestingAll(false);
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
    testSingleRelay,
    testAllRelays,
    getStatus,
  };
}
