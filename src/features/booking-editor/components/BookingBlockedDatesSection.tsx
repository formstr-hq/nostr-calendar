import {
  Box,
  IconButton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import type { BlockedWindow } from "../hooks/useSchedulingPageForm";

function timeStringToDayjs(time: string): Dayjs {
  const [h, m] = time.split(":");
  return dayjs().hour(parseInt(h)).minute(parseInt(m)).second(0);
}

function dayjsToTimeString(d: Dayjs | null): string {
  if (!d) return "09:00";
  return d.format("HH:mm");
}

interface BookingBlockedDatesSectionProps {
  blockedWindows: BlockedWindow[];
  updateBlockedWindow: (index: number, updates: Partial<BlockedWindow>) => void;
  removeBlockedWindow: (index: number) => void;
}

export function BookingBlockedDatesSection({
  blockedWindows,
  updateBlockedWindow,
  removeBlockedWindow,
}: BookingBlockedDatesSectionProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (blockedWindows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: "scheduling.noBlockedDates" })}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {blockedWindows.map((w, index) => (
        <Box
          key={`${w.date}-${index}`}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}
        >
          <TextField
            type="date"
            size="small"
            value={w.date}
            onChange={(event) =>
              updateBlockedWindow(index, { date: event.target.value })
            }
            slotProps={{
              htmlInput: {
                "aria-label": `Blocked date ${index + 1}`,
                "data-testid": `blocked-date-input-${index}`,
              },
            }}
            sx={{ width: 160 }}
          />
          <TimePicker
            value={timeStringToDayjs(w.startTime)}
            onChange={(v) =>
              updateBlockedWindow(index, { startTime: dayjsToTimeString(v) })
            }
            slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
          />
          <Typography variant="body2">to</Typography>
          <TimePicker
            value={timeStringToDayjs(w.endTime)}
            onChange={(v) =>
              updateBlockedWindow(index, { endTime: dayjsToTimeString(v) })
            }
            slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
          />
          <IconButton size="small" onClick={() => removeBlockedWindow(index)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
