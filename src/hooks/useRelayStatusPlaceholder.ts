import { useRelayStore } from "../stores/relays";
import type { RelayStatusEntry } from "../components/ui/RelayStatusDots";

/**
 * Placeholder for RelayStatusDots: no live per-relay connection tracking
 * exists yet (docs/REDESIGN_PROGRESS.md notes this as deferred), so every
 * configured relay is reported "ok". Swap for real connection state when
 * that plumbing exists.
 */
export function useRelayStatusPlaceholder(): RelayStatusEntry[] {
  const relays = useRelayStore((s) => s.relays);
  return relays.map((url) => ({ url, status: "ok" as const }));
}
