import { createRoot } from "react-dom/client";
import App from "./App";
import "./main.css";
import { initCalendarFavicon } from "./utils/calendarFavicon";
import { overrideConsole } from "./utils/logger";

overrideConsole();
initCalendarFavicon();

createRoot(document.getElementById("root")!).render(<App />);
