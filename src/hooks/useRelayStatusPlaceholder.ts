import { useEffect } from "react";
import { useRelayStore } from "../stores/relays";
import type { RelayStatusEntry } from "../components/ui/RelayStatusDots";
import { getRelays } from "../common/relayConfig";
import { fetchWorkerRelayHealth } from "../nostr/relayConnection";

/**
 * Provides live connection status for configured relays.
 * When a relay has been tested or observed by the worker, its status reflects real connectivity:
 * - "ok" (green): successfully connected with fast latency (<1.2s)
 * - "pending" (yellow): slow connection (>=1.2s) or currently testing
 * - "error" (red): connection failed, timed out, or closed unexpectedly
 * Untested relays are reported as "untested" (grey) and do not count as connected.
 */
export function useRelayStatusPlaceholder(): RelayStatusEntry[] {
  const storeRelays = useRelayStore((s) => s.relays);
  const statuses = useRelayStore((s) => s.connectionStatuses);
  const setAllConnectionStatuses = useRelayStore(
    (s) => s.setAllConnectionStatuses,
  );
  const relays = storeRelays.length > 0 ? storeRelays : getRelays();

  useEffect(() => {
    let mounted = true;
    void fetchWorkerRelayHealth().then((healthMap) => {
      if (mounted && Object.keys(healthMap).length > 0) {
        setAllConnectionStatuses(healthMap);
      }
    });
    return () => {
      mounted = false;
    };
  }, [relays, setAllConnectionStatuses]);

  return relays.map((url) => {
    const info = statuses[url];
    if (!info || info.status === "untested") {
      return { url, status: "untested" as const };
    }
    if (info.status === "testing" || info.status === "slow") {
      return { url, status: "pending" as const };
    }
    if (info.status === "error") {
      return { url, status: "error" as const };
    }
    return { url, status: "ok" as const };
  });
}
