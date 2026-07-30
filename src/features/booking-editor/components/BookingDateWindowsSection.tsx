import {
  Box,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import type { OneOffWindow } from "../hooks/useSchedulingPageForm";

function timeStringToDayjs(time: string): Dayjs {
  const [h, m] = time.split(":");
  return dayjs().hour(parseInt(h)).minute(parseInt(m)).second(0);
}

function dayjsToTimeString(d: Dayjs | null): string {
  if (!d) return "09:00";
  return d.format("HH:mm");
}

interface BookingDateWindowsSectionProps {
  oneOffWindows: OneOffWindow[];
  updateOneOffWindow: (index: number, updates: Partial<OneOffWindow>) => void;
  removeOneOffWindow: (index: number) => void;
}

export function BookingDateWindowsSection({
  oneOffWindows,
  updateOneOffWindow,
  removeOneOffWindow,
}: BookingDateWindowsSectionProps) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (oneOffWindows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({ id: "scheduling.noAdditionalWindows" })}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {oneOffWindows.map((w, index) => (
        <Box
          key={index}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}
        >
          <MuiDatePicker
            value={dayjs(w.date)}
            onChange={(v) =>
              updateOneOffWindow(index, {
                date: v ? v.format("YYYY-MM-DD") : w.date,
              })
            }
            slotProps={{
              textField: { size: "small", sx: { width: 160 } },
            }}
          />
          <TimePicker
            value={timeStringToDayjs(w.startTime)}
            onChange={(v) =>
              updateOneOffWindow(index, { startTime: dayjsToTimeString(v) })
            }
            slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
          />
          <Typography variant="body2">to</Typography>
          <TimePicker
            value={timeStringToDayjs(w.endTime)}
            onChange={(v) =>
              updateOneOffWindow(index, { endTime: dayjsToTimeString(v) })
            }
            slotProps={{ textField: { size: "small", sx: { width: 130 } } }}
          />
          <IconButton size="small" onClick={() => removeOneOffWindow(index)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}
