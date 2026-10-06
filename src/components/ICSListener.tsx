import { useEffect, useRef } from "react";
import { parseICSMultiple } from "../common/utils";
import { ICalendarEvent } from "../utils/types";
import { useUser } from "../stores/user";
import { useBulkImport } from "../stores/bulkImport";
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

  const processContent = (content: string) => {
    try {
      const events = parseICSMultiple(content);
      if (events.length === 1) {
        onImportEvent(events[0]);
      } else if (events.length > 1) {
        useBulkImport.getState().openWithEvents(events);
      }
    } catch (err) {
      console.error("Failed to parse .ics file:", err);
    }
  };

  // Android currently dispatches this event for .ics file intents. Registering
  // the passive listener everywhere also keeps the bridge testable on the web.
  useEffect(() => {
    const handleIcsFile = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      if (!content) return;

      if (!user) {
        // User not logged in yet (cold start) — hold the content until they are
        pendingIcsContent.current = content;
        return;
      }

      processContent(content);
    };

    window.addEventListener("icsFileReceived", handleIcsFile);
    return () => {
      window.removeEventListener("icsFileReceived", handleIcsFile);
    };
  }, [user, onImportEvent]);

  // Process pending ICS content once the user logs in
  useEffect(() => {
    if (!user || !pendingIcsContent.current) return;

    processContent(pendingIcsContent.current);
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
