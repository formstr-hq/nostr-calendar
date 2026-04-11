import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Switch,
  FormControlLabel,
  IconButton,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  Tooltip,
  Paper,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Toolbar,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import { useSchedulingPages } from "../stores/schedulingPages";
import { Header } from "./Header";
import type {
  ISchedulingPage,
  IAvailabilityWindow,
  DurationMode,
} from "../utils/types";
import { ROUTES } from "../utils/routingHelper";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

const MIN_NOTICE_OPTIONS = [
  { label: "1 hour", value: 3600 },
  { label: "2 hours", value: 7200 },
  { label: "4 hours", value: 14400 },
  { label: "8 hours", value: 28800 },
  { label: "24 hours", value: 86400 },
  { label: "48 hours", value: 172800 },
];

const MAX_ADVANCE_OPTIONS = [
  { label: "7 days", value: 604800 },
  { label: "14 days", value: 1209600 },
  { label: "30 days", value: 2592000 },
  { label: "60 days", value: 5184000 },
  { label: "90 days", value: 7776000 },
];

const BUFFER_OPTIONS = [
  { label: "None", value: 0 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

const EXPIRY_OPTIONS = [
  { label: "24 hours", value: 86400 },
  { label: "48 hours", value: 172800 },
  { label: "72 hours", value: 259200 },
  { label: "7 days", value: 604800 },
  { label: "Never", value: 0 },
];

interface RecurringDayConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

type WeeklyAvailability = RecurringDayConfig[];

const DEFAULT_WEEKLY: WeeklyAvailability = DAY_NAMES.map((_, i) => ({
  enabled: i >= 1 && i <= 5, // Mon-Fri enabled by default
  startTime: "09:00",
  endTime: "17:00",
}));

interface OneOffWindow {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

function timeStringToDayjs(time: string): Dayjs {
  const [h, m] = time.split(":");
  return dayjs().hour(parseInt(h)).minute(parseInt(m)).second(0);
}

function dayjsToTimeString(d: Dayjs | null): string {
  if (!d) return "09:00";
  return d.format("HH:mm");
}

export const SchedulingPageEdit = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { pages, isLoaded, createPage, updatePage, getNAddr, fetchPages } =
    useSchedulingPages();

  const isEditMode = !!naddr;

  // Find existing page when editing
  const existingPage = useMemo(() => {
    if (!naddr || !isLoaded) return null;
    // naddr encodes kind + pubkey + identifier; we match by identifier (d-tag)
    // The pages array has been loaded, find by matching naddr
    return pages.find((p) => getNAddr(p) === naddr) || null;
  }, [naddr, isLoaded, pages, getNAddr]);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [image, setImage] = useState("");
  const [durationMode, setDurationMode] = useState<DurationMode>("fixed");
  const [slotDurations, setSlotDurations] = useState<number[]>([30]);
  const [weekly, setWeekly] = useState<WeeklyAvailability>(DEFAULT_WEEKLY);
  const [oneOffWindows, setOneOffWindows] = useState<OneOffWindow[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [minNotice, setMinNotice] = useState(3600);
  const [maxAdvance, setMaxAdvance] = useState(2592000);
  const [buffer, setBuffer] = useState(900);
  const [expiry, setExpiry] = useState(172800);

  const [processing, setProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [savedNAddr, setSavedNAddr] = useState<string | null>(null);

  // Load existing page data into form
  useEffect(() => {
    if (!existingPage) return;
    setTitle(existingPage.title);
    setDescription(existingPage.description);
    setLocation(existingPage.location);
    setImage(existingPage.image || "");
    setDurationMode(existingPage.durationMode);
    setSlotDurations(
      existingPage.slotDurations.length > 0 ? existingPage.slotDurations : [30],
    );
    setTimezone(existingPage.timezone);
    setMinNotice(existingPage.minNotice);
    setMaxAdvance(existingPage.maxAdvance);
    setBuffer(existingPage.buffer);
    setExpiry(existingPage.expiry);
    setBlockedDates(existingPage.blockedDates);

    // Parse availability windows into weekly + one-off
    const newWeekly: WeeklyAvailability = DAY_NAMES.map(() => ({
      enabled: false,
      startTime: "09:00",
      endTime: "17:00",
    }));
    const newOneOff: OneOffWindow[] = [];

    for (const w of existingPage.availabilityWindows) {
      if (w.type === "recurring" && w.dayOfWeek !== undefined) {
        newWeekly[w.dayOfWeek] = {
          enabled: true,
          startTime: w.startTime,
          endTime: w.endTime,
        };
      } else if (w.type === "date" && w.date) {
        newOneOff.push({
          date: w.date,
          startTime: w.startTime,
          endTime: w.endTime,
        });
      }
    }

    setWeekly(newWeekly);
    setOneOffWindows(newOneOff);
  }, [existingPage]);

  // Ensure pages are fetched
  useEffect(() => {
    if (!isLoaded) {
      fetchPages();
    }
  }, [isLoaded, fetchPages]);

  // Build availability windows from form state
  const buildAvailabilityWindows = useCallback((): IAvailabilityWindow[] => {
    const windows: IAvailabilityWindow[] = [];
    weekly.forEach((day, index) => {
      if (day.enabled) {
        windows.push({
          type: "recurring",
          dayOfWeek: index,
          startTime: day.startTime,
          endTime: day.endTime,
        });
      }
    });
    oneOffWindows.forEach((w) => {
      windows.push({
        type: "date",
        date: w.date,
        startTime: w.startTime,
        endTime: w.endTime,
      });
    });
    return windows;
  }, [weekly, oneOffWindows]);

  const handleSave = async () => {
    setProcessing(true);
    try {
      const pageData: Omit<
        ISchedulingPage,
        "id" | "eventId" | "user" | "createdAt"
      > = {
        title,
        description,
        slotDurations: durationMode === "fixed" ? slotDurations : [],
        durationMode,
        availabilityWindows: buildAvailabilityWindows(),
        blockedDates,
        timezone,
        minNotice,
        maxAdvance,
        buffer,
        expiry,
        location,
        image: image || undefined,
      };

      let saved: ISchedulingPage;
      if (isEditMode && existingPage) {
        saved = await updatePage({ ...existingPage, ...pageData });
      } else {
        saved = await createPage(pageData);
      }

      const addr = getNAddr(saved);
      setSavedNAddr(addr);
      setSnackbar({
        open: true,
        message: isEditMode
          ? "Scheduling page updated!"
          : "Scheduling page created!",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message:
          e instanceof Error ? e.message : "Failed to save scheduling page",
        severity: "error",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyLink = () => {
    if (!savedNAddr) return;
    const url = `${window.location.origin}/schedule/${savedNAddr}`;
    navigator.clipboard.writeText(url);
    setSnackbar({
      open: true,
      message: "Link copied to clipboard!",
      severity: "success",
    });
  };

  const toggleDuration = (mins: number) => {
    setSlotDurations((prev) =>
      prev.includes(mins) ? prev.filter((d) => d !== mins) : [...prev, mins],
    );
  };

  const updateWeeklyDay = (
    dayIndex: number,
    updates: Partial<RecurringDayConfig>,
  ) => {
    setWeekly((prev) =>
      prev.map((d, i) => (i === dayIndex ? { ...d, ...updates } : d)),
    );
  };

  const addOneOffWindow = () => {
    setOneOffWindows((prev) => [
      ...prev,
      {
        date: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "17:00",
      },
    ]);
  };

  const updateOneOffWindow = (
    index: number,
    updates: Partial<OneOffWindow>,
  ) => {
    setOneOffWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w)),
    );
  };

  const removeOneOffWindow = (index: number) => {
    setOneOffWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const addBlockedDate = (date: Dayjs | null) => {
    if (!date) return;
    const dateStr = date.format("YYYY-MM-DD");
    if (!blockedDates.includes(dateStr)) {
      setBlockedDates((prev) => [...prev, dateStr]);
    }
  };

  const removeBlockedDate = (dateStr: string) => {
    setBlockedDates((prev) => prev.filter((d) => d !== dateStr));
  };

  const hasAvailability =
    weekly.some((d) => d.enabled) || oneOffWindows.length > 0;

  const canSave =
    !processing &&
    title.trim() !== "" &&
    hasAvailability &&
    (durationMode === "free" || slotDurations.length > 0);

  // Loading state for edit mode
  if (isEditMode && !isLoaded) {
    return (
      <>
        <Header />
        <Toolbar />
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "50vh",
          }}
        >
          <CircularProgress />
        </Box>
      </>
    );
  }

  if (isEditMode && isLoaded && !existingPage) {
    return (
      <>
        <Header />
        <Toolbar />
        <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
          <Alert severity="error">
            Scheduling page not found. It may have been deleted.
          </Alert>
        </Box>
      </>
    );
  }

  return (
    <>
      <Header />
      <Toolbar />
      <Box sx={{ maxWidth: 800, mx: "auto", p: isMobile ? 2 : 3 }}>
        {/* Top bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            mb: 3,
            gap: 1,
          }}
        >
          <IconButton onClick={() => navigate(ROUTES.Bookings)} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5">
            {isEditMode ? "Edit Scheduling Page" : "Create Scheduling Page"}
          </Typography>
        </Box>

        {/* Saved link banner */}
        {savedNAddr && (
          <Alert
            severity="success"
            sx={{ mb: 3 }}
            action={
              <Tooltip title="Copy link">
                <IconButton size="small" onClick={handleCopyLink}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            Your scheduling page is live! Share the link for others to book
            appointments.
          </Alert>
        )}

        {/* Basic Info */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Basic Information
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              fullWidth
              label="Title"
              placeholder="e.g., Schedule a meeting with me"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              size="small"
            />
            <TextField
              fullWidth
              label="Description"
              placeholder="Booking instructions or details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={3}
              size="small"
            />
            <TextField
              fullWidth
              label="Location"
              placeholder="e.g., Google Meet, Zoom, In person"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              size="small"
            />
            <TextField
              fullWidth
              label="Image URL"
              placeholder="https://example.com/image.jpg"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              size="small"
            />
          </Box>
        </Paper>

        {/* Duration Settings */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Appointment Duration
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
            <FormControlLabel
              control={
                <Switch
                  checked={durationMode === "free"}
                  onChange={(e) =>
                    setDurationMode(e.target.checked ? "free" : "fixed")
                  }
                />
              }
              label={
                durationMode === "free"
                  ? "Booker picks any duration"
                  : "Fixed duration options"
              }
            />
          </Box>
          {durationMode === "fixed" && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {DURATION_OPTIONS.map((mins) => (
                <Chip
                  key={mins}
                  label={mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  color={slotDurations.includes(mins) ? "primary" : "default"}
                  variant={slotDurations.includes(mins) ? "filled" : "outlined"}
                  onClick={() => toggleDuration(mins)}
                />
              ))}
            </Box>
          )}
        </Paper>

        {/* Weekly Availability */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Weekly Availability
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {DAY_NAMES.map((dayName, dayIndex) => (
              <Box
                key={dayIndex}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: isMobile ? 1 : 2,
                  flexWrap: isMobile ? "wrap" : "nowrap",
                }}
              >
                <FormControlLabel
                  sx={{ minWidth: isMobile ? 100 : 130 }}
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
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TimePicker
                      value={timeStringToDayjs(weekly[dayIndex].startTime)}
                      onChange={(v) =>
                        updateWeeklyDay(dayIndex, {
                          startTime: dayjsToTimeString(v),
                        })
                      }
                      slotProps={{
                        textField: { size: "small", sx: { width: 130 } },
                      }}
                    />
                    <Typography variant="body2">to</Typography>
                    <TimePicker
                      value={timeStringToDayjs(weekly[dayIndex].endTime)}
                      onChange={(v) =>
                        updateWeeklyDay(dayIndex, {
                          endTime: dayjsToTimeString(v),
                        })
                      }
                      slotProps={{
                        textField: { size: "small", sx: { width: 130 } },
                      }}
                    />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Paper>

        {/* One-off Date Windows */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="subtitle1">Additional Date Windows</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addOneOffWindow}
            >
              Add Date
            </Button>
          </Box>
          {oneOffWindows.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No additional date windows. Use this for one-off availability
              outside your weekly schedule.
            </Typography>
          )}
          {oneOffWindows.map((w, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 1.5,
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
                  updateOneOffWindow(index, {
                    startTime: dayjsToTimeString(v),
                  })
                }
                slotProps={{
                  textField: { size: "small", sx: { width: 130 } },
                }}
              />
              <Typography variant="body2">to</Typography>
              <TimePicker
                value={timeStringToDayjs(w.endTime)}
                onChange={(v) =>
                  updateOneOffWindow(index, {
                    endTime: dayjsToTimeString(v),
                  })
                }
                slotProps={{
                  textField: { size: "small", sx: { width: 130 } },
                }}
              />
              <IconButton
                size="small"
                onClick={() => removeOneOffWindow(index)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Paper>

        {/* Blocked Dates */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Blocked Dates
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Block specific dates to override your weekly availability.
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <MuiDatePicker
              label="Add blocked date"
              onChange={addBlockedDate}
              slotProps={{
                textField: { size: "small" },
              }}
            />
          </Box>
          {blockedDates.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {blockedDates.map((dateStr) => (
                <Chip
                  key={dateStr}
                  label={dateStr}
                  onDelete={() => removeBlockedDate(dateStr)}
                  variant="outlined"
                />
              ))}
            </Box>
          )}
        </Paper>

        {/* Settings */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Settings
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 2,
            }}
          >
            <TextField
              fullWidth
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              size="small"
              helperText="Auto-detected from your browser"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Minimum Notice</InputLabel>
              <Select
                value={minNotice}
                label="Minimum Notice"
                onChange={(e) => setMinNotice(Number(e.target.value))}
              >
                {MIN_NOTICE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Maximum Advance Booking</InputLabel>
              <Select
                value={maxAdvance}
                label="Maximum Advance Booking"
                onChange={(e) => setMaxAdvance(Number(e.target.value))}
              >
                {MAX_ADVANCE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Buffer Between Appointments</InputLabel>
              <Select
                value={buffer}
                label="Buffer Between Appointments"
                onChange={(e) => setBuffer(Number(e.target.value))}
              >
                {BUFFER_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Request Expiry</InputLabel>
              <Select
                value={expiry}
                label="Request Expiry"
                onChange={(e) => setExpiry(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Paper>

        <Divider sx={{ my: 2 }} />

        {/* Action Buttons */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 2,
            pb: 4,
          }}
        >
          <Button color="inherit" onClick={() => navigate(ROUTES.Bookings)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSave} onClick={handleSave}>
            {processing
              ? "Saving..."
              : isEditMode
                ? "Update Page"
                : "Create Page"}
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};
