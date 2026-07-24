import { Box, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { SettingsCard } from "./components/SettingsCard";

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
      <SettingsCard label={intl.formatMessage({ id: "settings.calendars" })}>
        <Box sx={{ minHeight: 120 }} />
      </SettingsCard>
    </>
  );
}
