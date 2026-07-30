import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./main.css";
import { initCalendarFavicon } from "./utils/calendarFavicon";
import { overrideConsole } from "./utils/logger";
import { isNative } from "./utils/platform";
import { bootstrapDataLayer } from "./dataLayer/bootstrap";

overrideConsole();
initCalendarFavicon();
bootstrapDataLayer();

if (!isNative) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
