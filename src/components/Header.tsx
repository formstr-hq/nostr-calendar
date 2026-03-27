import { IconButton, Toolbar } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import { Link } from "react-router";
import { UserMenu } from "./UserMenu";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useRef } from "react";
import { parseICS } from "../common/utils";
import { ICalendarEvent } from "../utils/types";

export const HEADER_HEIGHT = 56;

interface HeaderProps {
  onImportEvent?: (event: ICalendarEvent) => void;
}

export const Header = ({ onImportEvent }: HeaderProps) => {
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
    <AppBar
      position="fixed"
      color="primary"
      style={{
        justifyContent: "start",
        backgroundColor: "white",
      }}
    >
      <Toolbar
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            to={"/"}
            style={{
              display: "flex",
              alignItems: "center",
              width: "fit-content",
            }}
          >
            <img
              src="/formstr.png"
              style={{
                objectFit: "contain",
                height: "40px",
                width: "fit-content",
              }}
              alt="Calendar Logo"
            />
          </Link>
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
        </div>
        <UserMenu />
      </Toolbar>
    </AppBar>
  );
};
