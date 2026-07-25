/**
 * Publish Activity Engine
 *
 * A general-purpose way to run a *named, multi-step* nostr publish and track
 * each step's relay outcomes independently, instead of one flat relay-status
 * blob standing in for an entire flow (see `useRelayPublishStatus` for the
 * older single-batch version this generalizes).
 *
 * Callers describe a flow as an ordered list of `PublishStepDefinition`s and
 * hand it to `runFlow`. Steps marked `blocking` are awaited in order before
 * the next one starts (so later steps can read results an earlier step
 * assigned to a shared closure variable); non-blocking steps are kicked off
 * without being awaited by `runFlow` itself, but keep reporting into the same
 * flow's state as they resolve. This is a zustand store (not a hook) so it
 * can be driven from store actions (e.g. a booking-approval flow) as well as
 * from components.
 */

import { create } from "zustand";
import { normalizeURL } from "nostr-tools/utils";
import type { RelayStatusMap } from "../utils/types";
import { getRelayPublishCounts } from "../utils/relayPublishStatus";

export type PublishStepStatus = "pending" | "ok" | "error";

export interface PublishStepState {
  id: string;
  labelId: string;
  relays: string[];
  relayStatus: RelayStatusMap;
  status: PublishStepStatus;
}

export interface PublishStepCallbacks {
  /** Report a relay outcome for this step. */
  onRelayComplete: (url: string, success: boolean) => void;
  /**
   * Report a relay outcome for a *different* step in the same flow. Needed
   * when one underlying async call (e.g. `publishPrivateCalendarEvent`, which
   * publishes the event and gift-wraps invitations in one go) produces
   * outcomes that belong to more than one visible step.
   */
  reportRelayOutcome: (stepId: string, url: string, success: boolean) => void;
}

export interface PublishStepDefinition {
  id: string;
  labelId: string;
  relays: string[];
  /** true = runFlow awaits this before starting the next step; false = fired
   *  without blocking the flow, but still updates the tracker as it resolves. */
  blocking: boolean;
  run: (callbacks: PublishStepCallbacks) => Promise<void>;
}

interface PublishFlowState {
  steps: PublishStepState[];
}

interface PublishActivityState {
  flows: Record<string, PublishFlowState>;
  runFlow: (flowId: string, steps: PublishStepDefinition[]) => Promise<void>;
  retryStep: (flowId: string, stepId: string) => Promise<void>;
  clearFlow: (flowId: string) => void;
}

/** Original step definitions per flow, kept for retry — not reactive state. */
const flowDefinitions: Record<string, PublishStepDefinition[]> = {};

function normalizeRelays(relays: string[]): string[] {
  return Array.from(new Set(relays.map(normalizeURL)));
}

function seedStep(def: PublishStepDefinition): PublishStepState {
  const relays = normalizeRelays(def.relays);
  return {
    id: def.id,
    labelId: def.labelId,
    relays,
    relayStatus: Object.fromEntries(
      relays.map((url) => [url, "pending" as const]),
    ) as RelayStatusMap,
    status: "pending",
  };
}

function deriveStepStatus(
  relays: string[],
  relayStatus: RelayStatusMap,
): PublishStepStatus {
  const { pendingCount, acceptedCount, totalCount } = getRelayPublishCounts(
    relays,
    relayStatus,
  );
  if (totalCount === 0) return "ok";
  if (pendingCount > 0) return "pending";
  return acceptedCount > 0 ? "ok" : "error";
}

export const usePublishActivityStore = create<PublishActivityState>((set) => {
  function updateStep(
    flowId: string,
    stepId: string,
    update: (step: PublishStepState) => PublishStepState,
  ) {
    set((state) => {
      const flow = state.flows[flowId];
      if (!flow) return state;
      return {
        flows: {
          ...state.flows,
          [flowId]: {
            steps: flow.steps.map((step) =>
              step.id === stepId ? update(step) : step,
            ),
          },
        },
      };
    });
  }

  function reportRelayOutcome(
    flowId: string,
    stepId: string,
    url: string,
    success: boolean,
  ) {
    const normalized = normalizeURL(url);
    updateStep(flowId, stepId, (step) => {
      const relayStatus: RelayStatusMap = {
        ...step.relayStatus,
        [normalized]: success ? "ok" : "error",
      };
      return {
        ...step,
        relayStatus,
        status: deriveStepStatus(step.relays, relayStatus),
      };
    });
  }

  function markStepFailed(flowId: string, stepId: string) {
    updateStep(flowId, stepId, (step) => {
      const relayStatus: RelayStatusMap = Object.fromEntries(
        step.relays.map((url) => [
          url,
          step.relayStatus[url] === "ok" ? "ok" : "error",
        ]),
      ) as RelayStatusMap;
      return {
        ...step,
        relayStatus,
        status: deriveStepStatus(step.relays, relayStatus),
      };
    });
  }

  /**
   * A step's `run` can resolve without reporting every relay (or any relay
   * at all) — e.g. a calendar-move that's a no-op because the event is
   * already in the target calendar. Once `run` resolves without throwing,
   * anything still "pending" is assumed to have needed no publish, not to
   * be stuck in flight forever.
   */
  function finalizeStep(flowId: string, stepId: string) {
    updateStep(flowId, stepId, (step) => {
      const relayStatus: RelayStatusMap = Object.fromEntries(
        step.relays.map((url) => [
          url,
          step.relayStatus[url] === "pending" ? "ok" : step.relayStatus[url],
        ]),
      ) as RelayStatusMap;
      return {
        ...step,
        relayStatus,
        status: deriveStepStatus(step.relays, relayStatus),
      };
    });
  }

  async function runStep(
    flowId: string,
    def: PublishStepDefinition,
    propagateErrors: boolean,
  ) {
    const callbacks: PublishStepCallbacks = {
      onRelayComplete: (url, success) =>
        reportRelayOutcome(flowId, def.id, url, success),
      reportRelayOutcome: (stepId, url, success) =>
        reportRelayOutcome(flowId, stepId, url, success),
    };
    try {
      await def.run(callbacks);
      finalizeStep(flowId, def.id);
    } catch (err) {
      markStepFailed(flowId, def.id);
      if (propagateErrors) throw err;
    }
  }

  return {
    flows: {},

    runFlow: async (flowId, steps) => {
      flowDefinitions[flowId] = steps;
      set((state) => ({
        flows: {
          ...state.flows,
          [flowId]: { steps: steps.map(seedStep) },
        },
      }));
      for (const def of steps) {
        if (def.blocking) {
          await runStep(flowId, def, true);
        } else {
          void runStep(flowId, def, false);
        }
      }
    },

    retryStep: async (flowId, stepId) => {
      const def = flowDefinitions[flowId]?.find((d) => d.id === stepId);
      if (!def) return;
      updateStep(flowId, stepId, (step) => ({
        ...step,
        relayStatus: Object.fromEntries(
          step.relays.map((url) => [url, "pending" as const]),
        ) as RelayStatusMap,
        status: "pending",
      }));
      await runStep(flowId, def, true);
    },

    clearFlow: (flowId) => {
      delete flowDefinitions[flowId];
      set((state) => {
        const flows = { ...state.flows };
        delete flows[flowId];
        return { flows };
      });
    },
  };
});

/** Convenience selector hook for components rendering one flow's status. */
export function usePublishActivity(
  flowId: string,
): PublishFlowState | undefined {
  return usePublishActivityStore((state) => state.flows[flowId]);
}
