import {
  Box,
  FormControlLabel,
  IconButton,
  Switch,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { Dayjs } from "dayjs";
import {
  DAY_NAMES,
  type WeeklyAvailability,
} from "../hooks/useSchedulingPageForm";

function timeStringToDayjs(time: string): Dayjs {
  const [h, m] = time.split(":");
  return dayjs().hour(parseInt(h)).minute(parseInt(m)).second(0);
}

function dayjsToTimeString(d: Dayjs | null): string {
  if (!d) return "09:00";
  return d.format("HH:mm");
}

interface BookingWeeklyAvailabilitySectionProps {
  weekly: WeeklyAvailability;
  updateWeeklyDay: (dayIndex: number, updates: { enabled?: boolean }) => void;
  addWeeklyRange: (dayIndex: number) => void;
  updateWeeklyRange: (
    dayIndex: number,
    rangeIndex: number,
    updates: { startTime?: string; endTime?: string },
  ) => void;
  removeWeeklyRange: (dayIndex: number, rangeIndex: number) => void;
}

export function BookingWeeklyAvailabilitySection({
  weekly,
  updateWeeklyDay,
  addWeeklyRange,
  updateWeeklyRange,
  removeWeeklyRange,
}: BookingWeeklyAvailabilitySectionProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {DAY_NAMES.map((dayName, dayIndex) => (
        <Box
          key={dayIndex}
          sx={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            gap: isMobile ? 1.5 : 2,
            flexWrap: "wrap",
            minWidth: 0,
            ...(isMobile && {
              p: 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "background.paper",
            }),
          }}
        >
          <FormControlLabel
            sx={{
              minWidth: isMobile ? 0 : 130,
              m: 0,
              "& .MuiFormControlLabel-label": {
                fontWeight: isMobile ? 600 : 400,
              },
            }}
            control={
              <Switch
                checked={weekly[dayIndex].enabled}
                onChange={(e) =>
                  updateWeeklyDay(dayIndex, { enabled: e.target.checked })
                }
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                {isMobile ? dayName.slice(0, 3) : dayName}
              </Typography>
            }
          />
          {weekly[dayIndex].enabled && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flex: isMobile ? undefined : 1,
                width: isMobile ? "100%" : undefined,
                minWidth: 0,
                flexWrap: "wrap",
              }}
            >
              {weekly[dayIndex].ranges.map((range, rangeIndex) => (
                <Box
                  key={rangeIndex}
                  sx={{
                    display: isMobile ? "grid" : "flex",
                    gridTemplateColumns: isMobile
                      ? "minmax(0, 1fr) auto minmax(0, 1fr) auto"
                      : undefined,
                    alignItems: "center",
                    gap: 1,
                    width: isMobile ? "100%" : undefined,
                    minWidth: 0,
                  }}
                >
                  <TimePicker
                    value={timeStringToDayjs(range.startTime)}
                    onChange={(v) =>
                      updateWeeklyRange(dayIndex, rangeIndex, {
                        startTime: dayjsToTimeString(v),
                      })
                    }
                    slotProps={{
                      textField: {
                        size: "small",
                        sx: { minWidth: isMobile ? 0 : 110, width: "100%" },
                      },
                    }}
                  />
                  <Typography variant="body2">to</Typography>
                  <TimePicker
                    value={timeStringToDayjs(range.endTime)}
                    onChange={(v) =>
                      updateWeeklyRange(dayIndex, rangeIndex, {
                        endTime: dayjsToTimeString(v),
                      })
                    }
                    slotProps={{
                      textField: {
                        size: "small",
                        sx: { minWidth: isMobile ? 0 : 110, width: "100%" },
                      },
                    }}
                  />
                  {weekly[dayIndex].ranges.length > 1 && (
                    <IconButton
                      size="small"
                      aria-label="Remove time range"
                      onClick={() => removeWeeklyRange(dayIndex, rangeIndex)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
              <IconButton
                size="small"
                aria-label="Add time range"
                onClick={() => addWeeklyRange(dayIndex)}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
