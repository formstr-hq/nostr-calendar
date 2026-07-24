import { AppThemeProvider } from "./theme/AppThemeProvider";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useUser } from "./stores/user";
import { IntlProvider } from "react-intl";
import { flattenMessages } from "./common/utils";
import dictionary, { NestedObject } from "./common/dictionary";
import LoginModal from "./components/LoginModal";
import { BrowserRouter, useLocation, useNavigate } from "react-router";
import { Routing } from "./components/Routing";
import { AppShell } from "./components/AppShell";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  addNotificationClickListener,
  requestNotificationPermission,
} from "./utils/notifications";
import { useTimeBasedEvents } from "./stores/events";
import { isIOSNative, isNative } from "./utils/platform";
import { setSecureItem } from "./common/localStorage";
import {
  BG_KEY_LAST_BOOKING_REQUEST_FETCH_TIME,
  BG_KEY_LAST_BOOKING_RESPONSE_FETCH_TIME,
  BG_KEY_LAST_INVITATION_FETCH_TIME,
} from "./utils/constants";
import { ICSListener } from "./components/ICSListener";
import { ICalendarEvent } from "./utils/types";
import { useCalendarLists } from "./stores/calendarLists";
import { notifyAppReady } from "./plugins/appReady";
import { AppLoadingBar } from "./components/AppLoadingBar";
import { getDataLayer } from "@formstr/local-relay";

import { useInvitations } from "./stores/invitations";
import { useBusyList } from "./stores/busyList";
import { busyListMonthKeysForRange } from "./utils/dateHelper";
import { useDateWithRouting } from "./hooks/useDateWithRouting";
import { isPublicAppPath } from "./utils/deepLinks";
import { useNativeDeepLinks } from "./hooks/useNativeDeepLinks";

const browserLocale =
  (navigator.languages && navigator.languages[0]) ||
  navigator.language ||
  "en-US";

const _locale = ~Object.keys(dictionary).indexOf(browserLocale)
  ? browserLocale
  : "en-US";

function Application() {
  const {
    user,
    isInitialized,
    initializeUser,
    showLoginModal,
    updateLoginModal,
  } = useUser();
  const [importedEvent, setImportedEvent] = useState<ICalendarEvent | null>(
    null,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const fetchPrivateEvents = useTimeBasedEvents(
    (state) => state.fetchPrivateEvents,
  );
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();
  const publicRoute = isPublicAppPath(location.pathname);
  const shouldRenderRouting = isInitialized && (Boolean(user) || publicRoute);
  const iosNative = isIOSNative();

  useEffect(() => {
    initializeUser();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("ios-native", iosNative);
  }, [iosNative]);

  // The app has no internal scroll container (the document itself scrolls,
  // per the redesign's shell architecture) so reset window scroll on
  // navigation instead of a ref'd container.
  useEffect(() => {
    if (!iosNative) return;
    window.scrollTo({ top: 0, left: 0 });
  }, [iosNative, location.pathname, location.search]);

  const { fetchInvitations, stopInvitations } = useInvitations();

  // When user is logged in, fetch calendar lists and invitations.
  // Private events are fetched reactively when calendars are loaded.
  useEffect(() => {
    if (isInitialized && user) {
      useCalendarLists.getState().fetchCalendars();
    }
  }, [isInitialized, user]);

  // Fetch private events whenever visible calendars change.
  // This ensures events update when calendars load from network
  // or when the user toggles calendar visibility.
  useEffect(() => {
    if (user && isInitialized && calendarsLoaded) {
      void fetchPrivateEvents();
      fetchInvitations();
    }
  }, [
    user,
    calendarsLoaded,
    fetchPrivateEvents,
    fetchInvitations,
    isInitialized,
    calendars.length,
  ]);

  // Refetch the user's own public busy lists whenever the visible month
  // changes, so add/remove operations merge with the latest remote state
  // and viewers navigating across months see up-to-date availability.
  const { date: visibleDate } = useDateWithRouting();
  const visibleMonthKey = `${visibleDate.year()}-${visibleDate.month()}`;
  useEffect(() => {
    if (!user || !isInitialized || !calendarsLoaded) return;
    const center = visibleDate.startOf("month").valueOf();
    const month = 30 * 24 * 60 * 60 * 1000;
    void useBusyList
      .getState()
      .loadOwnLists(
        busyListMonthKeysForRange(center - month, center + 2 * month),
      );
    // visibleMonthKey is the stable derived dep; visibleDate identity
    // changes on every render so we key off the month string instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isInitialized, calendarsLoaded, visibleMonthKey]);

  // Cleanup invitation listener on unmount
  useEffect(() => {
    return () => stopInvitations();
  }, []);

  useEffect(() => {
    return addNotificationClickListener((eventId) => {
      navigate(`/notification-event/${eventId}`);
    });
  }, [navigate]);

  // Native background schedulers do not prompt; notification permission must
  // be requested while the foreground app is active.
  useEffect(() => {
    if (!isNative || !user || !isInitialized) return;
    void requestNotificationPermission();
  }, [isInitialized, user]);

  // Handle Android back button: navigate back instead of closing the app.
  // Only exit the app if there's no browser history to go back to.
  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      const listener = CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });
      cleanup = () => {
        listener.then((l) => l.remove());
      };
    });

    return () => {
      cleanup?.();
    };
  }, []);

  // Close every relay socket when the app is backgrounded and reopen on
  // resume — the worker keeps the store and standing interests either way.
  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) getDataLayer().resume();
        else getDataLayer().pause();
      });
      cleanup = () => {
        listener.then((l) => l.remove());
      };
    });

    return () => {
      cleanup?.();
    };
  }, []);

  // Update last invitation fetch time when app resumes (for background invitation worker)
  useEffect(() => {
    if (!isNative || !user) return;

    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          const now = Math.floor(Date.now() / 1000);
          setSecureItem(BG_KEY_LAST_INVITATION_FETCH_TIME, now);
          setSecureItem(BG_KEY_LAST_BOOKING_REQUEST_FETCH_TIME, now);
          setSecureItem(BG_KEY_LAST_BOOKING_RESPONSE_FETCH_TIME, now);
        }
      });
      cleanup = () => {
        listener.then((l) => l.remove());
      };
    });

    return () => {
      cleanup?.();
    };
  }, [user]);

  // Handle deep-link navigation from native notification clicks
  useEffect(() => {
    const handler = (e: Event) => {
      const route = (e as CustomEvent<string>).detail;
      if (route) navigate(route);
    };
    window.addEventListener("openRoute", handler);
    if (isNative) {
      void notifyAppReady();
    }
    return () => window.removeEventListener("openRoute", handler);
  }, [navigate]);

  useEffect(() => {
    if (!isInitialized || user) return;

    if (publicRoute) {
      updateLoginModal(false);
      return;
    }

    updateLoginModal(true);
  }, [user, isInitialized, updateLoginModal, publicRoute]);
  useNativeDeepLinks();

  return (
    <>
      <ICSListener
        importedEvent={importedEvent}
        onClose={() => setImportedEvent(null)}
        onImportEvent={setImportedEvent}
      />
      <LoginModal
        open={showLoginModal}
        onClose={() => updateLoginModal(false)}
      />

      <AppLoadingBar />

      {user ? (
        <AppShell onImportEvent={setImportedEvent}>
          <Routing />
        </AppShell>
      ) : shouldRenderRouting ? (
        // Logged-out visitor on a public route (shared event / booking
        // page): render the route content directly, no app chrome.
        <Routing />
      ) : null}
    </>
  );
}

function useDayjsLocale() {
  const [dayjsLocale, setDayjsLocale] = useState("en");

  useEffect(() => {
    const tag = browserLocale.toLowerCase();
    // Try full tag (e.g. "en-gb"), then language only (e.g. "de")
    const candidates = [tag, tag.split("-")[0]];
    console.log(browserLocale);
    (async () => {
      for (const candidate of candidates) {
        if (candidate === "en") return; // already the default
        try {
          await import(/* @vite-ignore */ `dayjs/locale/${candidate}.js`);
          dayjs.locale(candidate);
          setDayjsLocale(candidate);
          return;
        } catch {
          // locale file not available, try next
        }
      }
    })();
  }, []);

  return dayjsLocale;
}

export default function App() {
  const i18nLocale = _locale;
  const dayjsLocale = useDayjsLocale();
  const locale_dictionary = {
    ...flattenMessages(dictionary["en-US"] as NestedObject),
    ...flattenMessages(dictionary[i18nLocale] as NestedObject),
  };
  return (
    <IntlProvider locale={i18nLocale} messages={locale_dictionary}>
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale={dayjsLocale}
      >
        <AppThemeProvider>
          <BrowserRouter>
            <Application />
          </BrowserRouter>
        </AppThemeProvider>
      </LocalizationProvider>
    </IntlProvider>
  );
}
