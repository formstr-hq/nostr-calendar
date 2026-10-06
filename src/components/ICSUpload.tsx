import { IconButton, Snackbar } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef, useState } from "react";
import { useIntl } from "react-intl";
import { parseICSMultiple } from "../common/utils";
import { extractICSFromZip } from "../common/zipExtractor";
import { useBulkImport } from "../stores/bulkImport";
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

    if (isZip) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const buffer = ev.target?.result as ArrayBuffer;
          const icsFiles = await extractICSFromZip(buffer);
          let allEvents: ICalendarEvent[] = [];

          for (const item of icsFiles) {
            const parsed = parseICSMultiple(item.content);
            allEvents = allEvents.concat(parsed);
          }

          if (allEvents.length === 0) {
            setErrorMessage(
              intl.formatMessage({ id: "bulkImport.noEventsFound" }),
            );
            return;
          }

          useBulkImport.getState().openWithEvents(allEvents, file.name);
        } catch (err) {
          console.error("Failed to extract zip file:", err);
          setErrorMessage(intl.formatMessage({ id: "bulkImport.invalidFile" }));
        }
      };
      reader.onerror = () => {
        setErrorMessage(intl.formatMessage({ id: "bulkImport.invalidFile" }));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const events = parseICSMultiple(content);

          if (events.length === 0) {
            setErrorMessage(
              intl.formatMessage({ id: "bulkImport.noEventsFound" }),
            );
            return;
          }

          // Single event: keep existing one-event workflow if callback provided
          if (events.length === 1 && onImportEvent) {
            onImportEvent(events[0]);
          } else {
            useBulkImport.getState().openWithEvents(events, file.name);
          }
        } catch (err) {
          console.error("Failed to parse ICS file:", err);
          setErrorMessage(intl.formatMessage({ id: "bulkImport.invalidFile" }));
        }
      };
      reader.onerror = () => {
        setErrorMessage(intl.formatMessage({ id: "bulkImport.invalidFile" }));
      };
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
