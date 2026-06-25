import { createRoot } from "react-dom/client";
import App from "./App";
import "./main.css";
import { initCalendarFavicon } from "./utils/calendarFavicon";
import { overrideConsole } from "./utils/logger";
import { isNative } from "./utils/platform";

overrideConsole();
initCalendarFavicon();

if (!isNative) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
