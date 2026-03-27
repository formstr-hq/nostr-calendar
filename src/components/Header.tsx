import { Toolbar } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import { Link } from "react-router";
import { UserMenu } from "./UserMenu";
import { ICSUpload } from "./ICSUpload";
import { ICalendarEvent } from "../utils/types";

export const HEADER_HEIGHT = 56;

interface HeaderProps {
  onImportEvent?: (event: ICalendarEvent) => void;
}

export const Header = ({ onImportEvent }: HeaderProps) => {
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
          <ICSUpload onImportEvent={onImportEvent} />
        </div>
        <UserMenu />
      </Toolbar>
    </AppBar>
  );
};
