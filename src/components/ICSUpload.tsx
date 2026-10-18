import { IconButton, Snackbar } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import { parseICSMultiple } from "../common/utils";
import { extractICSFromZip } from "../common/zipExtractor";
import { useBulkImport } from "../stores/bulkImport";
import { useCalendarLists } from "../stores/calendarLists";
import { buildDestinationCalendars } from "../features/bulk-import/utils/destinationCalendars";
import { ICalendarEvent } from "../utils/types";

interface ICSUploadProps {
  onImportEvent?: (event: ICalendarEvent) => void;
  size?: "small" | "medium" | "large";
}

export const ICSUpload = ({
  onImportEvent,
  size = "small",
}: ICSUploadProps) => {
  const intl = useIntl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isZip =
      file.name.toLowerCase().endsWith(".zip") ||
      file.type.includes("zip") ||
      file.type.includes("compressed");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (isZip) {
          const icsFiles = await extractICSFromZip(
            ev.target?.result as ArrayBuffer,
          );
          if (icsFiles.length === 0) {
            setErrorMessage(
              intl.formatMessage({ id: "bulkImport.zipContainsNoICSFiles" }),
            );
            return;
          }

          const parsedFiles = icsFiles
            .map((f) => ({
              filename: f.filename,
              content: f.content,
              events: parseICSMultiple(f.content),
            }))
            .filter((f) => f.events.length > 0);
          const events = parsedFiles.flatMap((f) => f.events);

          if (events.length === 0) {
            setErrorMessage(
              intl.formatMessage({ id: "bulkImport.zipNoEventsFound" }),
            );
            return;
          }

          const existingCalendars = useCalendarLists.getState().calendars;
          const destinationCalendars =
            parsedFiles.length > 1
              ? buildDestinationCalendars(parsedFiles, existingCalendars)
              : [];

          useBulkImport
            .getState()
            .openWithEvents(events, file.name, destinationCalendars);
        } else {
          const content = ev.target?.result as string;
          const events = parseICSMultiple(content);

          if (events.length === 0) {
            setErrorMessage(
              intl.formatMessage({ id: "bulkImport.icsNoEventsFound" }),
            );
            return;
          }

          // Single .ics files keep the existing one-event workflow.
          if (events.length === 1 && onImportEvent) {
            onImportEvent(events[0]);
          } else {
            useBulkImport.getState().openWithEvents(events, file.name);
          }
        }
      } catch (err) {
        console.error(
          isZip ? "Failed to extract zip file:" : "Failed to parse ICS file:",
          err,
        );
        setErrorMessage(
          intl.formatMessage({
            id: isZip ? "bulkImport.invalidZip" : "bulkImport.invalidICS",
          }),
        );
      }
    };
    reader.onerror = () => {
      setErrorMessage(
        intl.formatMessage({
          id: isZip ? "bulkImport.invalidZip" : "bulkImport.invalidICS",
        }),
      );
    };

    if (isZip) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }

    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const tooltipText = intl.formatMessage({ id: "ics.importTooltip" });

  return (
    <>
      <IconButton
        onClick={() => fileInputRef.current?.click()}
        size={size}
        title={tooltipText}
        aria-label="Import .ics file"
      >
        <UploadFileIcon />
      </IconButton>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics,.zip,text/calendar,application/zip,application/x-zip-compressed"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <Snackbar
        open={Boolean(errorMessage)}
        autoHideDuration={4000}
        onClose={() => setErrorMessage(null)}
        message={errorMessage}
      />
    </>
  );
};
