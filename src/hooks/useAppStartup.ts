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

export function useAppStartup(): AppStartupState {
  const intl = useIntl();
  const { user, isInitialized } = useUser();
  const { isLoaded: calendarsLoaded } = useCalendarLists();

  const [stage, setStage] = useState<StartupStage>("loading_cache");
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const statusMessage = getStatusMessage(
    stage,
    user?.name ?? user?.pubkey?.slice(0, 8),
    intl,
  );

  const clearFetchTimeout = () => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
  };

  const retry = () => {
    retryCountRef.current += 1;
    clearFetchTimeout();
    setStage("loading_cache");
    useUser.getState().initializeUser();
  };

  useEffect(() => {
    if (!isInitialized) {
      setStage("loading_cache");
      return;
    }

    if (!user) {
      setStage("no_login");
      return;
    }

    if (stage === "loading_cache" || stage === "no_login") {
      setStage("user_loaded");
    }
  }, [isInitialized, user]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (stage !== "fetching_events") return;

    fetchTimeoutRef.current = setTimeout(() => {
      setStage("error");
    }, FETCH_TIMEOUT_MS);

    return clearFetchTimeout;
  }, [stage]);

  useEffect(() => {
    if (calendarsLoaded && stage === "fetching_events") {
      clearFetchTimeout();
      setStage("ready");
    }
  }, [calendarsLoaded, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  return { stage, statusMessage, retry };
}

function getStatusMessage(
  stage: StartupStage,
  userLabel: string | undefined,
  intl: ReturnType<typeof useIntl>,
): string {
  switch (stage) {
    case "loading_cache":
      return intl.formatMessage(
        { id: "startup.loadingCache" },
        { defaultMessage: "Restoring login from secure storage…" },
      );
    case "user_loaded":
      return userLabel
        ? intl.formatMessage(
            { id: "startup.welcomeBack" },
            { user: userLabel, defaultMessage: `Welcome back, ${userLabel}!` },
          )
        : intl.formatMessage(
            { id: "startup.welcomeBackGeneric" },
            { defaultMessage: "Welcome back!" },
          );
    case "fetching_events":
      return intl.formatMessage(
        { id: "startup.fetchingEvents" },
        { defaultMessage: "Fetching your calendar lists and events…" },
      );
    case "ready":
      return "";
    case "no_login":
      return intl.formatMessage(
        { id: "startup.noLogin" },
        { defaultMessage: "No saved login found." },
      );
    case "error":
      return intl.formatMessage(
        { id: "startup.error" },
        { defaultMessage: "Could not load your data. Check your connection." },
      );
    default:
      return "";
  }
}
