import { IconButton } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef } from "react";
import { parseICS } from "../common/utils";
import { ICalendarEvent } from "../utils/types";

interface ICSUploadProps {
  onImportEvent?: (event: ICalendarEvent) => void;
}

export const ICSUpload = ({ onImportEvent }: ICSUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const event = parseICS(content);
      if (event && onImportEvent) {
        onImportEvent(event);
      }
    };
    reader.readAsText(file);

    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <>
      <IconButton
        onClick={() => fileInputRef.current?.click()}
        size="small"
        title="Import .ics file"
      >
        <UploadFileIcon />
      </IconButton>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics,text/calendar"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </>
  );
};
