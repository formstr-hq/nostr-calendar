import { ThemeProvider, CssBaseline, Box, Toolbar } from "@mui/material";
import { theme } from "./theme";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useUser } from "./stores/user";
import { IntlProvider } from "react-intl";
import { flattenMessages } from "./common/utils";
import dictionary from "./common/dictionary";
import LoginModal from "./components/LoginModal";
import RelayManager from "./components/RelayManager";
import { BrowserRouter, useNavigate } from "react-router";
import { Routing } from "./components/Routing";
import { Header } from "./components/Header";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { addNotificationClickListener } from "./utils/notifications";
import { useTimeBasedEvents } from "./stores/events";
import { isNative } from "./utils/platform";
import { setSecureItem } from "./common/localStorage";
import { BG_KEY_LAST_INVITATION_FETCH_TIME } from "./utils/constants";
import { ICSListener } from "./components/ICSListener";
import { ICalendarEvent } from "./utils/types";
import { useCalendarLists } from "./stores/calendarLists";
import { CalendarManageDialog } from "./components/CalendarManageDialog";
import { notifyAppReady } from "./plugins/appReady";
import { AppLoadingBar } from "./components/AppLoadingBar";
import { useInvitations } from "./stores/invitations";

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
  const events = useTimeBasedEvents((state) => state);
  const {
    calendars,
    isLoaded: calendarsLoaded,
    createCalendar,
    fetchCalendars,
  } = useCalendarLists();
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);

  useEffect(() => {
    initializeUser();
  }, []);

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
      events.fetchPrivateEvents();
      fetchInvitations();
    }
  }, [user, calendarsLoaded, events, fetchInvitations, isInitialized]);

  // Cleanup invitation listener on unmount
  useEffect(() => {
    return () => stopInvitations();
  }, []);

  useEffect(() => {
    return addNotificationClickListener((eventId) => {
      navigate(`/notification-event/${eventId}`);
    });
  }, [navigate]);

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

  // Update last invitation fetch time when app resumes (for background invitation worker)
  useEffect(() => {
    if (!isNative || !user) return;

    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          setSecureItem(
            BG_KEY_LAST_INVITATION_FETCH_TIME,
            Math.floor(Date.now() / 1000),
          );
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
    if (!user && isInitialized) {
      updateLoginModal(true);
    }
  }, [user, isInitialized, updateLoginModal]);

  // Show onboarding dialog when user is logged in but has no calendars
  useEffect(() => {
    if (isInitialized && calendarsLoaded && calendars.length === 0) {
      setShowOnboardingDialog(true);
    } else {
      setShowOnboardingDialog(false);
    }
  }, [user, calendarsLoaded, calendars.length, isInitialized]);

  const handleOnboardingSave = async (data: {
    title: string;
    description: string;
    color: string;
    notificationPreference: "enabled" | "disabled";
  }) => {
    await createCalendar(
      data.title,
      data.description,
      data.color,
      data.notificationPreference,
    );
    setShowOnboardingDialog(false);
  };

  return (
    <>
      <Header onImportEvent={setImportedEvent} />

      <ICSListener
        importedEvent={importedEvent}
        onClose={() => setImportedEvent(null)}
        onImportEvent={setImportedEvent}
      />
      <LoginModal
        open={showLoginModal}
        onClose={() => updateLoginModal(false)}
      />

      {showOnboardingDialog && (
        <CalendarManageDialog
          open={showOnboardingDialog}
          onClose={() => setShowOnboardingDialog(false)}
          onSave={handleOnboardingSave}
          onRefetch={fetchCalendars}
          blocking
        />
      )}

      <RelayManager />
      <Toolbar />

      <AppLoadingBar />

      <Box>{user && <Routing />}</Box>
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
    ...flattenMessages(dictionary["en-US"]),
    ...flattenMessages(dictionary[i18nLocale]),
  };
  return (
    <IntlProvider locale={i18nLocale} messages={locale_dictionary}>
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale={dayjsLocale}
      >
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BrowserRouter>
            <Application />
          </BrowserRouter>
        </ThemeProvider>
      </LocalizationProvider>
    </IntlProvider>
  );
}
