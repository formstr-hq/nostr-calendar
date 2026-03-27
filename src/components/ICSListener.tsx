import { useEffect } from "react";
import { parseICS } from "../common/utils";
import { ICalendarEvent } from "../utils/types";
import { isAndroidNative } from "../utils/platform";
import CalendarEventEdit from "./CalendarEventEdit";

interface ICSListenerProps {
  importedEvent: ICalendarEvent | null;
  onClose: () => void;
  onImportEvent: (event: ICalendarEvent) => void;
}

export function ICSListener({
  importedEvent,
  onClose,
  onImportEvent,
}: ICSListenerProps) {
  // Handle incoming .ics files on Android (when app is opened via file intent)
  useEffect(() => {
    if (!isAndroidNative()) return;

    let cleanup: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapApp }) => {
      const handleAppUrl = async (data: { url: string }) => {
        try {
          const response = await fetch(data.url);
          const content = await response.text();
          const event = parseICS(content);
          if (event) {
            onImportEvent(event);
          }
        } catch (err) {
          console.error("Failed to read .ics file:", err);
        }
      };

      // Check if app was opened with a URL
      CapApp.getLaunchUrl().then((result) => {
        if (result?.url) {
          handleAppUrl({ url: result.url });
        }
      });

      // Listen for future file opens
      const listener = CapApp.addListener("appUrlOpen", handleAppUrl);
      cleanup = () => {
        listener.then((l) => l.remove());
      };
    });

    return () => {
      cleanup?.();
    };
  }, [onImportEvent]);

  if (!importedEvent) return null;

  return (
    <CalendarEventEdit
      open={true}
      event={importedEvent}
      onClose={onClose}
      mode="create"
    />
  );
}
