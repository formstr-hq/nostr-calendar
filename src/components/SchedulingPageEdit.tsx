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
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";
import localeData from "dayjs/plugin/localeData";
dayjs.extend(localeData);
import { useSchedulingPages } from "../stores/schedulingPages";
import { Header } from "./Header";
import type {
  ISchedulingPage,
  IAvailabilityWindow,
} from "../utils/types";
import { ROUTES } from "../utils/routingHelper";
import { useIntl } from "react-intl";

const DAY_NAMES = dayjs.weekdays();

const PRESET_DURATIONS = [15, 30, 60];

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

interface BlockedWindow {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}

type SchedulingFormData = Pick<
  ISchedulingPage,
  | "title"
  | "description"
  | "location"
  | "slotDurations"
  | "blockedDates"
  | "maxAdvance"
  | "buffer"
  | "expiry"
> & {
  eventTitle: string;
  image: string;
};

const DEFAULT_FORM_DATA: SchedulingFormData = {
  title: "",
  eventTitle: "",
  description: "",
  location: "",
  image: "",
  slotDurations: [30],
  blockedDates: [],
  maxAdvance: 2592000,
  buffer: 900,
  expiry: 0,
};

function timeStringToDayjs(time: string): Dayjs {
  const [h, m] = time.split(":");
  return dayjs().hour(parseInt(h)).minute(parseInt(m)).second(0);
}

function dayjsToTimeString(d: Dayjs | null): string {
  if (!d) return "09:00";
  return d.format("HH:mm");
}

function parseBlockedDateEntry(entry: string): BlockedWindow {
  const [date, startTime, endTime] = entry.split("|");
  if (date && startTime && endTime) {
    return { date, startTime, endTime };
  }
  return {
    date: entry,
    startTime: "00:00",
    endTime: "23:59",
  };
}

function serializeBlockedWindow(bw: BlockedWindow): string {
  if (bw.startTime === "00:00" && bw.endTime === "23:59") {
    return bw.date;
  }
  return `${bw.date}|${bw.startTime}|${bw.endTime}`;
}

export const SchedulingPageEdit = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const intl = useIntl();

  const {
    pages,
    isLoaded,
    createPage,
    updatePage,
    getNAddr,
    getPageUrl,
    fetchPages,
  } = useSchedulingPages();

  const isEditMode = !!naddr;

  // Find existing page when editing
  const existingPage = useMemo(() => {
    if (!naddr || !isLoaded) return null;
    // naddr encodes kind + pubkey + identifier; we match by identifier (d-tag)
    // The pages array has been loaded, find by matching naddr
    return pages.find((p) => getNAddr(p) === naddr) || null;
  }, [naddr, isLoaded, pages, getNAddr]);

  // Form state — maps to ISchedulingPage fields
  const [formData, setFormData] =
    useState<SchedulingFormData>(DEFAULT_FORM_DATA);
  const updateField = <K extends keyof SchedulingFormData>(
    field: K,
    value: SchedulingFormData[K],
  ) => setFormData((prev) => ({ ...prev, [field]: value }));

  const [weekly, setWeekly] = useState<WeeklyAvailability>(DEFAULT_WEEKLY);
  const [oneOffWindows, setOneOffWindows] = useState<OneOffWindow[]>([]);
  const [blockedWindows, setBlockedWindows] = useState<BlockedWindow[]>([]);

  const [processing, setProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [savedNAddr, setSavedNAddr] = useState<string | null>(null);
  const [savedPageUrl, setSavedPageUrl] = useState<string | null>(null);

  // Load existing page data into form
  useEffect(() => {
    if (!existingPage) return;
    setFormData({
      title: existingPage.title,
      eventTitle: existingPage.eventTitle || "",
      description: existingPage.description,
      location: existingPage.location,
      image: existingPage.image || "",
      slotDurations:
        existingPage.slotDurations.length > 0
          ? existingPage.slotDurations
          : [30],
      blockedDates: existingPage.blockedDates,
      maxAdvance: existingPage.maxAdvance,
      buffer: existingPage.buffer,
      expiry: existingPage.expiry,
    });

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
    setBlockedWindows(existingPage.blockedDates.map(parseBlockedDateEntry));
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
      // Auto-detect the host's timezone from the browser. The host enters
      // availability windows like "09:00" thinking in their own local time;
      // storing that timezone alongside lets viewers in any other timezone
      // see the host's "9 AM" anchored correctly. Falls back to UTC if the
      // browser refuses to report a tz (very old environments).
      const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const pageData: Omit<
        ISchedulingPage,
        "id" | "eventId" | "user" | "createdAt"
      > = {
        ...formData,
        blockedDates: blockedWindows.map(serializeBlockedWindow),
        timezone:
          isEditMode && existingPage?.timezone
            ? existingPage.timezone
            : browserTimezone,
        minNotice: 0,
        durationMode: "fixed",
        eventTitle: formData.eventTitle || undefined,
        image: formData.image || undefined,
        slotDurations: formData.slotDurations,
        availabilityWindows: buildAvailabilityWindows(),
      };

      let saved: ISchedulingPage;
      if (isEditMode && existingPage) {
        saved = await updatePage({ ...existingPage, ...pageData });
      } else {
        saved = await createPage(pageData);
      }

      const addr = getNAddr(saved);
      setSavedNAddr(addr);
      setSavedPageUrl(getPageUrl(saved));
      setSnackbar({
        open: true,
        message: isEditMode
          ? intl.formatMessage({ id: "scheduling.pageUpdated" })
          : intl.formatMessage({ id: "scheduling.pageCreated" }),
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
    if (!savedPageUrl) return;
    navigator.clipboard.writeText(savedPageUrl);
    setSnackbar({
      open: true,
      message: intl.formatMessage({ id: "scheduling.linkCopied" }),
      severity: "success",
    });
  };

  const toggleDuration = (mins: number) => {
    setFormData((prev) => ({
      ...prev,
      slotDurations: prev.slotDurations.includes(mins)
        ? prev.slotDurations.filter((d) => d !== mins)
        : [...prev.slotDurations, mins],
    }));
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

  const addBlockedWindow = () => {
    setBlockedWindows((prev) => [
      ...prev,
      {
        date: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "17:00",
      },
    ]);
  };

  const updateBlockedWindow = (
    index: number,
    updates: Partial<BlockedWindow>,
  ) => {
    setBlockedWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, ...updates } : w)),
    );
  };

  const removeBlockedWindow = (index: number) => {
    setBlockedWindows((prev) => prev.filter((_, i) => i !== index));
  };

  const hasAvailability =
    weekly.some((d) => d.enabled) || oneOffWindows.length > 0;

  const [customDuration, setCustomDuration] = useState("");

  const addCustomDuration = () => {
    const mins = parseInt(customDuration.trim(), 10);
    if (!isNaN(mins) && mins > 0) {
      setFormData((prev) => ({
        ...prev,
        slotDurations: prev.slotDurations.includes(mins)
          ? prev.slotDurations
          : [...prev.slotDurations, mins].sort((a, b) => a - b),
      }));
      setCustomDuration("");
    }
  };

  const canSave =
    !processing &&
    formData.title.trim() !== "" &&
    hasAvailability &&
    formData.slotDurations.length > 0;

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
            {intl.formatMessage({ id: "scheduling.pageNotFound" })}
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
            {isEditMode
              ? intl.formatMessage({ id: "scheduling.editSchedulingPage" })
              : intl.formatMessage({ id: "scheduling.createSchedulingPage" })}
          </Typography>

        </Box>

        {/* Feature description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {intl.formatMessage({ id: "scheduling.featureDescription" })}
        </Typography>

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
            {intl.formatMessage({ id: "scheduling.shareLinkMessage" })}
          </Alert>
        )}

        {/* Basic Info */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            {intl.formatMessage({ id: "scheduling.basicInformation" })}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              fullWidth
              label="Title"
              placeholder="e.g., Schedule a meeting with me"
              value={formData.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
              size="small"
            />
            <TextField
              fullWidth
              label="Event Title"
              placeholder="e.g., Meeting with {name}"
              value={formData.eventTitle}
              onChange={(e) => updateField("eventTitle", e.target.value)}
              size="small"
              helperText={intl.formatMessage({id:"scheduling.eventTitleHelp"})}
            />
            <TextField
              fullWidth
              label="Description"
              placeholder="Booking instructions or details..."
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              multiline
              rows={3}
              size="small"
            />
            <TextField
              fullWidth
              label="Location"
              placeholder="e.g., Google Meet, Zoom, In person"
              value={formData.location}
              onChange={(e) => updateField("location", e.target.value)}
              size="small"
            />
            <TextField
              fullWidth
              label="Image URL"
              placeholder="https://example.com/image.jpg"
              value={formData.image}
              onChange={(e) => updateField("image", e.target.value)}
              size="small"
            />
          </Box>
        </Paper>

        {/* Duration Settings */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            {intl.formatMessage({ id: "scheduling.appointmentDuration" })}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
            {PRESET_DURATIONS.map((mins) => (
              <Chip
                key={mins}
                label={mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                color={formData.slotDurations.includes(mins) ? "primary" : "default"}
                variant={formData.slotDurations.includes(mins) ? "filled" : "outlined"}
                onClick={() => toggleDuration(mins)}
              />
            ))}
            {formData.slotDurations
              .filter((m) => !PRESET_DURATIONS.includes(m))
              .map((mins) => (
                <Chip
                  key={mins}
                  label={mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  color="primary"
                  onDelete={() => toggleDuration(mins)}
                />
              ))}
            <TextField
              type="number"
              size="small"
              label={intl.formatMessage({ id: "scheduling.customDuration" })}
              placeholder={intl.formatMessage({ id: "scheduling.customDurationPlaceholder" })}
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomDuration();
                }
              }}
              sx={{ width: 170 }}
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <IconButton size="small" onClick={addCustomDuration} disabled={!customDuration}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>

        {/* Weekly Availability */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            {intl.formatMessage({ id: "scheduling.weeklyAvailability" })}
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
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                    <TimePicker
                      value={timeStringToDayjs(weekly[dayIndex].startTime)}
                      onChange={(v) =>
                        updateWeeklyDay(dayIndex, {
                          startTime: dayjsToTimeString(v),
                        })
                      }
                      slotProps={{
                        textField: { size: "small", sx: { minWidth: 110, flex: 1 } },
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
                        textField: { size: "small", sx: { minWidth: 110, flex: 1 } },
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
              mb: 1,
            }}
          >
            <Typography variant="subtitle1">
              {intl.formatMessage({ id: "scheduling.additionalDateWindows" })}
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addOneOffWindow}
            >
              {intl.formatMessage({ id: "scheduling.addDate" })}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: oneOffWindows.length > 0 ? 1.5 : 0 }}>
            {intl.formatMessage({ id: "scheduling.additionalDateWindowsHelp" })}
          </Typography>
          {oneOffWindows.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {intl.formatMessage({ id: "scheduling.noAdditionalWindows" })}
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
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
            }}
          >
            <Box>
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "scheduling.blockedDates" })}
              </Typography>
            </Box>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addBlockedWindow}
            >
              {intl.formatMessage({ id: "scheduling.addDate" })}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: blockedWindows.length > 0 ? 1.5 : 0 }}>
            {intl.formatMessage({ id: "scheduling.blockedDatesHelp" })}
          </Typography>
          {blockedWindows.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "scheduling.noBlockedDates" })}
            </Typography>
          )}
          {blockedWindows.map((w, index) => (
            <Box
              key={`${w.date}-${index}`}
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
                  updateBlockedWindow(index, {
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
                  updateBlockedWindow(index, {
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
                  updateBlockedWindow(index, {
                    endTime: dayjsToTimeString(v),
                  })
                }
                slotProps={{
                  textField: { size: "small", sx: { width: 130 } },
                }}
              />
              <IconButton
                size="small"
                onClick={() => removeBlockedWindow(index)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Paper>

        {/* Settings */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            {intl.formatMessage({ id: "scheduling.settings" })}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 2,
            }}
          >
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "scheduling.maxAdvanceBooking" })}
              </InputLabel>
              <Select
                value={formData.maxAdvance}
                label={intl.formatMessage({
                  id: "scheduling.maxAdvanceBooking",
                })}
                onChange={(e) =>
                  updateField("maxAdvance", Number(e.target.value))
                }
              >
                {MAX_ADVANCE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>
                {intl.formatMessage({ id: "scheduling.bufferBetween" })}
              </InputLabel>
              <Select
                value={formData.buffer}
                label={intl.formatMessage({ id: "scheduling.bufferBetween" })}
                onChange={(e) =>
                  updateField("buffer", Number(e.target.value))
                }
              >
                {BUFFER_OPTIONS.map((opt) => (
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
            alignItems: "center",
            gap: 1,
            pb: 4,
            flexWrap: "wrap",
          }}
        >
          {savedPageUrl && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1, minWidth: 200 }}>
              <TextField
                value={savedPageUrl}
                size="small"
                slotProps={{ input: { readOnly: true } }}
                sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
              />
              <Tooltip title={intl.formatMessage({ id: "scheduling.copyLink" })}>
                <IconButton size="small" onClick={handleCopyLink}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={intl.formatMessage({ id: "scheduling.openLink" })}>
                <IconButton
                  size="small"
                  component="a"
                  href={savedPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          <Button color="inherit" onClick={() => navigate(ROUTES.Bookings)}>
            Cancel
          </Button>
          {(isEditMode || !savedNAddr) && (
            <Button variant="contained" disabled={!canSave} onClick={handleSave}>
              {processing
                ? intl.formatMessage({ id: "scheduling.saving" })
                : isEditMode
                  ? intl.formatMessage({ id: "scheduling.updatePageButton" })
                  : intl.formatMessage({ id: "scheduling.createSchedulingPageButton" })}
            </Button>
          )}
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
