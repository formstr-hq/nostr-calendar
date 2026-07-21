import { Box, Chip, alpha, useTheme } from "@mui/material";
import PublicIcon from "@mui/icons-material/Public";
import LockIcon from "@mui/icons-material/Lock";
import CheckIcon from "@mui/icons-material/Check";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../../../utils/types";
import type { ICalendarList } from "../../../utils/calendarListTypes";
import { radius } from "../../../theme/tokens";

/** Public/private + calendar + saved-status chips (mockups 12/20/21). */
export function EventChipsRow({
  event,
  calendar,
}: {
  event: ICalendarEvent;
  calendar?: ICalendarList;
}) {
  const intl = useIntl();
  const theme = useTheme();

  if (event.source === "device") return null;

  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      <Chip
        size="small"
        icon={event.isPrivateEvent ? <LockIcon /> : <PublicIcon />}
        label={intl.formatMessage({
          id: event.isPrivateEvent
            ? "event.privateEventChip"
            : "event.publicEvent",
        })}
        sx={{ borderRadius: `${radius.pill}px` }}
      />
      {calendar && (
        <Chip
          size="small"
          label={calendar.title}
          sx={{
            borderRadius: `${radius.pill}px`,
            bgcolor: alpha(
              calendar.color,
              theme.palette.mode === "dark" ? 0.2 : 0.12,
            ),
            color: calendar.color,
            fontWeight: 600,
            "& .MuiChip-label": {
              display: "flex",
              alignItems: "center",
              gap: 0.5,
            },
          }}
          icon={
            <Box
              component="span"
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: calendar.color,
                ml: "8px",
              }}
            />
          }
        />
      )}
      {calendar && (
        <Chip
          size="small"
          icon={<CheckIcon />}
          label={intl.formatMessage({ id: "event.inYourCalendar" })}
          color="success"
          variant="outlined"
          sx={{ borderRadius: `${radius.pill}px` }}
        />
      )}
    </Box>
  );
}
