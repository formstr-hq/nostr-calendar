import { useEffect, useRef } from "react";
import { parseICS } from "../common/utils";
import { ICalendarEvent } from "../utils/types";
import { isAndroidNative } from "../utils/platform";
import { useUser } from "../stores/user";
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
  const { user } = useUser();
  const pendingIcsContent = useRef<string | null>(null);

  // Handle incoming .ics files on Android (when app is opened via file intent)
  useEffect(() => {
    if (!isAndroidNative()) return;

    const handleIcsFile = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!content) return;

      if (!user) {
        // User not logged in yet (cold start) — hold the content until they are
        pendingIcsContent.current = content;
        return;
      }

      try {
        const event = parseICS(content);
        if (event) {
          onImportEvent(event);
        }
      } catch (err) {
        console.error("Failed to parse .ics file:", err);
      }
    };

    window.addEventListener("icsFileReceived", handleIcsFile);
    return () => {
      window.removeEventListener("icsFileReceived", handleIcsFile);
    };
  }, [user, onImportEvent]);

  // Process pending ICS content once the user logs in
  useEffect(() => {
    if (!user || !pendingIcsContent.current) return;

    try {
      const event = parseICS(pendingIcsContent.current);
      if (event) {
        onImportEvent(event);
      }
    } catch (err) {
      console.error("Failed to parse pending .ics file:", err);
    }
    pendingIcsContent.current = null;
  }, [user, onImportEvent]);

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
