/**
 * useAppStartup
 *
 * Owns the startup state machine for the application. Drives the flow:
 *   loading_cache → user_loaded → fetching_events → ready | error
 *
 * Consumers receive a reactive { stage, statusMessage, retry } tuple.
 * They should render loading UI based on `stage` and call `retry` when
 * the error state is displayed.
 */

import { useEffect, useRef, useState } from "react";
import { useUser } from "../stores/user";
import { useCalendarLists } from "../stores/calendarLists";
import { useIntl } from "react-intl";

export type StartupStage =
  | "loading_cache"
  | "user_loaded"
  | "fetching_events"
  | "ready"
  | "no_login"
  | "error";

export interface AppStartupState {
  stage: StartupStage;
  statusMessage: string;
  retry: () => void;
}

/** How long to linger on "Welcome back!" before advancing to fetching_events */
const WELCOME_LINGER_MS = 900;

/** How long to wait for calendars before declaring an error */
const FETCH_TIMEOUT_MS = 15_000;

export function useAppStartup(appMode: "login" | "guest" | null): AppStartupState {
  const intl = useIntl();
  const { user, isInitialized } = useUser();
  const { isLoaded: calendarsLoaded } = useCalendarLists();

  const [stage, setStage] = useState<StartupStage>("loading_cache");
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // Derive a human-readable message from the current stage
  const statusMessage = getStatusMessage(stage, user?.name ?? user?.pubkey?.slice(0, 8), intl);

  // Clears the fetch timeout if one is running
  const clearFetchTimeout = () => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
  };

  // Retry: restart from loading_cache so the app re-attempts initialisation
  const retry = () => {
    retryCountRef.current += 1;
    clearFetchTimeout();
    setStage("loading_cache");
    useUser.getState().initializeUser();
  };

  // --- State transitions ---

  useEffect(() => {
    // Guest mode: nothing to fetch, skip straight to ready
    if (appMode === "guest") {
      setStage("ready");
      return;
    }

    if (!isInitialized) {
      // Still reading from cache – stay on loading_cache
      setStage("loading_cache");
      return;
    }

    if (!user) {
      // Cache read complete, no user found
      setStage("no_login");
      return;
    }

    // User found in cache/store
    if (stage === "loading_cache" || stage === "no_login") {
      setStage("user_loaded");
    }
  }, [isInitialized, user, appMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // After briefly showing "Welcome back!", advance to fetching_events
  useEffect(() => {
    if (stage !== "user_loaded") return;

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(() => {
      setStage("fetching_events");
    }, WELCOME_LINGER_MS);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [stage]);

  // Once we start fetching, start the safety timeout
  useEffect(() => {
    if (stage !== "fetching_events") return;

    fetchTimeoutRef.current = setTimeout(() => {
      setStage("error");
    }, FETCH_TIMEOUT_MS);

    return clearFetchTimeout;
  }, [stage]);

  // Watch calendarsLoaded to advance to ready
  useEffect(() => {
    if (calendarsLoaded && stage === "fetching_events") {
      clearFetchTimeout();
      setStage("ready");
    }
  }, [calendarsLoaded, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  return { stage, statusMessage, retry };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusMessage(
  stage: StartupStage,
  userLabel: string | undefined,
  intl: ReturnType<typeof useIntl>,
): string {
  switch (stage) {
    case "loading_cache":
      return intl.formatMessage({ id: "startup.loadingCache" }, { defaultMessage: "Retrieving login data from cache…" });
    case "user_loaded":
      return userLabel
        ? intl.formatMessage({ id: "startup.welcomeBack" }, { user: userLabel, defaultMessage: `Welcome back, ${userLabel}!` })
        : intl.formatMessage({ id: "startup.welcomeBackGeneric" }, { defaultMessage: "Welcome back!" });
    case "fetching_events":
      return intl.formatMessage({ id: "startup.fetchingEvents" }, { defaultMessage: "Fetching your calendar lists and events…" });
    case "ready":
      return "";
    case "no_login":
      return intl.formatMessage({ id: "startup.noLogin" }, { defaultMessage: "No saved login found." });
    case "error":
      return intl.formatMessage({ id: "startup.error" }, { defaultMessage: "Could not load your data. Check your connection." });
    default:
      return "";
  }
}
