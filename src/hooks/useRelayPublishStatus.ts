import { useCallback, useMemo, useRef, useState } from "react";
import { normalizeURL } from "nostr-tools/utils";
import type { RelayStatusMap } from "../utils/types";

function normalizeRelays(relays: string[]): string[] {
  return Array.from(new Set(relays.map(normalizeURL)));
}

export function useRelayPublishStatus() {
  const [relayStatus, setRelayStatus] = useState<RelayStatusMap>({});
  const [publishingRelays, setPublishingRelays] = useState<string[]>([]);
  const outcomesRef = useRef<Record<string, boolean>>({});

  const initRelays = useCallback((relays: string[]) => {
    const normalized = normalizeRelays(relays);
    outcomesRef.current = Object.fromEntries(
      normalized.map((relayUrl) => [relayUrl, false]),
    );
    setPublishingRelays(normalized);
    setRelayStatus(
      Object.fromEntries(
        normalized.map((relayUrl) => [relayUrl, "pending" as const]),
      ) as RelayStatusMap,
    );
  }, []);

  const onRelayComplete = useCallback((url: string, ok: boolean) => {
    const normalized = normalizeURL(url);
    outcomesRef.current[normalized] = ok;
    setRelayStatus((prev) => ({
      ...prev,
      [normalized]: ok ? "ok" : "error",
    }));
  }, []);

  const getFailedRelays = useCallback(
    (relays?: string[]) => {
      const targetRelays = relays ? normalizeRelays(relays) : publishingRelays;
      return targetRelays.filter(
        (relayUrl) => outcomesRef.current[relayUrl] !== true,
      );
    },
    [publishingRelays],
  );

  const setRelaysPending = useCallback((relays: string[]) => {
    const normalized = normalizeRelays(relays);
    setRelayStatus((prev) => {
      const next = { ...prev };
      for (const relayUrl of normalized) {
        next[relayUrl] = "pending";
        outcomesRef.current[relayUrl] = false;
      }
      return next;
    });
  }, []);

  const hasRelayErrors = useMemo(
    () => Object.values(relayStatus).some((status) => status === "error"),
    [relayStatus],
  );

  const reset = useCallback(() => {
    outcomesRef.current = {};
    setRelayStatus({});
    setPublishingRelays([]);
  }, []);

  return {
    relayStatus,
    publishingRelays,
    initRelays,
    onRelayComplete,
    getFailedRelays,
    setRelaysPending,
    hasRelayErrors,
    reset,
  };
}
