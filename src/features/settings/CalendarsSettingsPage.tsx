import { Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { CalendarsSettingsSynced } from "./components/CalendarsSettingsSynced";
import { CalendarsSettingsDevice } from "./components/CalendarsSettingsDevice";

export function CalendarsSettingsPage() {
  const intl = useIntl();

  return (
    <>
      <Typography variant="h5" fontWeight={800}>
        {intl.formatMessage({ id: "settings.calendars" })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {intl.formatMessage({ id: "settings.calendarsDescription" })}
      </Typography>

      <CalendarsSettingsSynced />
      <CalendarsSettingsDevice />
    </>
  );
}
