import ModeSelectionModal from "./components/ModeSelectionModal";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Toolbar,
  Dialog,
  DialogContent,
} from "@mui/material";
import { theme } from "./theme";
import { useEffect, useState } from "react";
import { useUser } from "./stores/user";
import { IntlProvider, useIntl } from "react-intl";
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
import { useRelayStore } from "./stores/relays";
import { isNative } from "./utils/platform";
import { ICSListener } from "./components/ICSListener";
import { ICalendarEvent } from "./utils/types";

let _locale =
  (navigator.languages && navigator.languages[0]) ||
  navigator.language ||
  "en-US";
_locale = ~Object.keys(dictionary).indexOf(_locale) ? _locale : "en-US";

function Application() {
  const intl = useIntl();
  const {
    user,
    isInitialized,
    initializeUser,
    showLoginModal,
    updateLoginModal,
  } = useUser();
  const [appMode, setAppMode] = useState<"login" | "guest" | null>(null);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [importedEvent, setImportedEvent] = useState<ICalendarEvent | null>(
    null,
  );
  const navigate = useNavigate();

  useEffect(() => {
    initializeUser();
    useTimeBasedEvents.getState().loadCachedEvents();
    useRelayStore.getState().loadCachedRelays();
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

  useEffect(() => {
    if (!user && !appMode && isInitialized) {
      setShowModeSelection(true);
    }
  }, [user, isInitialized, appMode]);

  useEffect(() => {
    if (appMode === "login" && isInitialized && !user) {
      const handleLogin = async () => {
        try {
          updateLoginModal(true);
        } catch (error) {
          console.error("Login failed:", error);
        }
      };

      handleLogin();
    }
  }, [appMode, user, isInitialized, updateLoginModal]);

  const handleModeSelection = (mode: "login" | "guest") => {
    setAppMode(mode);
    setShowModeSelection(false);
  };

  return (
    <>
      <Header onImportEvent={setImportedEvent} />
      <ICSListener
        importedEvent={importedEvent}
        onClose={() => setImportedEvent(null)}
        onImportEvent={setImportedEvent}
      />
      {/* Mode Selection Modal */}
      <ModeSelectionModal
        isOpen={showModeSelection}
        onModeSelect={handleModeSelection}
      />
      {/* Loading State */}
      {!showModeSelection && !appMode && !user && (
        <Dialog open>
          <DialogContent>
            <Box display="flex" justifyContent="center" alignItems="center">
              <Typography>
                {intl.formatMessage({ id: "message.loggingIn" })}
              </Typography>
            </Box>
          </DialogContent>
        </Dialog>
      )}
      <LoginModal
        open={showLoginModal}
        onClose={() => updateLoginModal(false)}
      />
      <RelayManager />
      <Toolbar />
      <Box>{user && isInitialized && <Routing />}</Box>
    </>
  );
}

export default function App() {
  const i18nLocale = _locale;
  const locale_dictionary = {
    ...flattenMessages(dictionary["en-US"]),
    ...flattenMessages(dictionary[i18nLocale]),
  };
  return (
    <IntlProvider locale={i18nLocale} messages={locale_dictionary}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
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
