import { useState } from "react";
import { Box, TextField, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { CalendarListSelect } from "../../../components/CalendarListSelect";
import { GroupCard, GroupRow } from "./styled";

interface CalendarLocationGroupProps {
  selectedCalendarId: string;
  onCalendarChange: (calendarId: string) => void;
  calendarsEmpty: boolean;
  location: string[];
  onLocationChange: (location: string[]) => void;
}

/** Mobile-only: Calendar + tap-to-edit Location, clubbed into one group card (deviations #6/#7). */
export function CalendarLocationGroup({
  selectedCalendarId,
  onCalendarChange,
  calendarsEmpty,
  location,
  onLocationChange,
}: CalendarLocationGroupProps) {
  const intl = useIntl();
  const [editingLocation, setEditingLocation] = useState(false);
  const [draft, setDraft] = useState(location.join(", "));

  const commitLocation = () => {
    onLocationChange(
      draft
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    setEditingLocation(false);
  };

  return (
    <GroupCard>
      <GroupRow first sx={{ flexDirection: "column", alignItems: "stretch" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, flexShrink: 0 }}>
            {intl.formatMessage({ id: "event.calendar" })}
          </Typography>
          <Box
            sx={{
              minWidth: 0,
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <CalendarListSelect
              value={selectedCalendarId}
              onChange={onCalendarChange}
              variant="row"
            />
          </Box>
        </Box>
        {calendarsEmpty && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 0.5 }}>
            {intl.formatMessage({ id: "event.calendarRequired" })}
          </Typography>
        )}
      </GroupRow>
      <GroupRow
        onClick={() => !editingLocation && setEditingLocation(true)}
        sx={{ cursor: editingLocation ? "default" : "pointer" }}
      >
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {intl.formatMessage({ id: "navigation.location" })}
        </Typography>
        {editingLocation ? (
          <TextField
            autoFocus
            variant="standard"
            size="small"
            value={draft}
            placeholder={intl.formatMessage({ id: "event.enterLocation" })}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLocation}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLocation();
              }
            }}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{
              "& .MuiInputBase-input": { textAlign: "right", fontSize: 14 },
            }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {location.join(", ") ||
              intl.formatMessage({ id: "event.enterLocation" })}
          </Typography>
        )}
      </GroupRow>
    </GroupCard>
  );
}
