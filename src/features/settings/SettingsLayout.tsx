import { Box } from "@mui/material";
import { Navigate, Route, Routes } from "react-router";
import { CalendarsSettingsPage } from "./CalendarsSettingsPage";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { RelaySettingsPage } from "./RelaySettingsPage";
import { SettingsNavigation } from "./components/SettingsNavigation";

export function SettingsLayout() {
  return (
    <Box
      sx={{
        display: { sm: "flex" },
        minHeight: "100%",
        bgcolor: "background.default",
      }}
    >
      <SettingsNavigation />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          maxWidth: 800,
          px: { xs: 2, sm: 4 },
          py: { xs: 2.5, sm: 3 },
          pb: { xs: 5, sm: 3 },
        }}
      >
        <Routes>
          <Route path="general" element={<GeneralSettingsPage />} />
          <Route path="calendars" element={<CalendarsSettingsPage />} />
          <Route path="relays" element={<RelaySettingsPage />} />
          <Route path="*" element={<Navigate to="general" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}
