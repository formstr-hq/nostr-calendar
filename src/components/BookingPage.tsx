import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  CircularProgress,
  Alert,
  Avatar,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  useMediaQuery,
  useTheme,
  Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import dayjs, { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import { NAddr, decode } from "nostr-tools/nip19";
import { EventKinds } from "../nostr/kinds";
import {
  sendBookingRequest,
  fetchSchedulingPage,
  createBookingIdentity,
} from "../nostr/booking";
import {
  getDisplaySlots,
  type IDisplaySlot,
} from "../utils/availabilityHelper";
import { useBusyList, collectBusyRanges } from "../stores/busyList";
import { busyListMonthKeysForRange } from "../utils/dateHelper";
import type { IBusyList } from "../utils/types";
import { useGetParticipant } from "../stores/participants";
import { useUser } from "../stores/user";
import { useBookingRequests } from "../stores/bookingRequests";
import { useCalendarLists } from "../stores/calendarLists";
import { buildEventRef } from "../utils/calendarListTypes";
import { ROUTES } from "../utils/routingHelper";
import { CalendarListSelect } from "./CalendarListSelect";
import { FormFillerDialog } from "./FormFillerDialog";
import { fetchAttachedFormCached } from "../utils/formAttachment";
import type {
  ISchedulingPage,
  ITimeSlot,
  IOutgoingBooking,
} from "../utils/types";

type FetchState = "loading" | "loaded" | "error";

function formatUtcOffset(date: Date, timeZone: string): string {
  const offset = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  return offset ? offset.replace("GMT", "UTC") : "UTC+0";
}

function formatHostTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export const BookingPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewKey = searchParams.get("viewKey");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user, updateLoginModal } = useUser();
  const intl = useIntl();

  const [page, setPage] = useState<ISchedulingPage | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ITimeSlot | null>(null);
  const [continueAfterLogin, setContinueAfterLogin] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingNote, setBookingNote] = useState("");
  const [bookingTitle, setBookingTitle] = useState("");
  const [activeFormIndex, setActiveFormIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const { calendars } = useCalendarLists();
  const [selectedCalendarId, setSelectedCalendarId] = useState("");

  // Initialize to first calendar once loaded
  useEffect(() => {
    if (calendars.length > 0 && !selectedCalendarId) {
      setSelectedCalendarId(calendars[0].id);
    }
  }, [calendars, selectedCalendarId]);

  // Observe the scheduling page \u2014 declarative, so it renders whenever the
  // event arrives (cache replay or upstream sync) instead of racing a
  // one-shot fetch timeout. A grace timer surfaces the error state for
  // genuinely missing pages.
  useEffect(() => {
    if (!naddr) return;
    setFetchState("loading");
    // All scheduling pages are private as of vNEXT \u2014 the URL must carry
    // a viewKey for decryption. Pages without one (legacy public pages or
    // tampered links) are rejected outright.
    if (!viewKey) {
      setFetchState("error");
      return;
    }
    let data: { identifier: string; pubkey: string; relays?: string[] };
    try {
      ({ data } = decode(naddr as NAddr));
    } catch {
      setFetchState("error");
      return;
    }
    const subscription = fetchSchedulingPage(
      {
        pubkey: data.pubkey,
        dTag: data.identifier,
        viewKeyHex: viewKey,
        relays: data.relays,
      },
      (parsed) => {
        setPage(parsed);
        // Default to first slot duration if fixed mode
        if (
          parsed.durationMode === "fixed" &&
          parsed.slotDurations.length > 0
        ) {
          setSelectedDuration(parsed.slotDurations[0]);
        }
        setFetchState("loaded");
      },
      () => {
        // Wrong/stale key for this version; a later good version may
        // still recover the page.
        setFetchState((s) => (s === "loaded" ? s : "error"));
      },
    );
    subscription.start();
    const errorTimer = setTimeout(
      () => setFetchState((s) => (s === "loading" ? "error" : s)),
      20_000,
    );
    return () => {
      clearTimeout(errorTimer);
      subscription.stop();
    };
  }, [naddr, viewKey]);

  // Warm the shared form-template cache as soon as a booking page arrives.
  // The confirmation flow still opens forms only after a slot is chosen, but
  // it no longer has to wait on their network fetch at that point.
  useEffect(() => {
    const attachments = page?.formAttachments;
    if (!attachments?.length) return;
    void Promise.allSettled(
      attachments.map((attachment) => fetchAttachedFormCached(attachment)),
    );
  }, [page]);

  // Desktop renders a month, while mobile renders a Sunday–Saturday week.
  // Fetch the range that is actually visible; a mobile week can cross a month
  // boundary, so using only selectedDate's month would mark its adjacent-month
  // days unavailable even when they have open slots.
  const monthStart = useMemo(
    () => selectedDate.startOf("month"),
    [selectedDate],
  );
  const monthEnd = useMemo(() => monthStart.add(1, "month"), [monthStart]);
  const mobileWeekDays = useMemo(() => {
    const start = selectedDate.startOf("week");
    return Array.from({ length: 7 }, (_, index) => start.add(index, "day"));
  }, [selectedDate]);
  const { availabilityStart, availabilityEnd } = useMemo(
    () =>
      isMobile
        ? {
            availabilityStart: mobileWeekDays[0],
            availabilityEnd: mobileWeekDays[0].add(1, "week"),
          }
        : { availabilityStart: monthStart, availabilityEnd: monthEnd },
    [isMobile, mobileWeekDays, monthStart, monthEnd],
  );

  // Public busy lists (kind 31926) for the host, scoped to the visible range.
  // Slots overlapping any of these ranges are filtered out by getBookableSlots.
  const fetchOtherBusyLists = useBusyList((s) => s.fetchBusyListsForUser);
  const [hostBusyLists, setHostBusyLists] = useState<IBusyList[]>([]);
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    const monthKeys = busyListMonthKeysForRange(
      availabilityStart.valueOf(),
      availabilityEnd.valueOf(),
    );
    fetchOtherBusyLists(page.user, monthKeys)
      .then((lists) => {
        if (!cancelled) setHostBusyLists(lists);
      })
      .catch((err) => {
        console.warn("Failed to fetch host busy lists:", err);
        if (!cancelled) setHostBusyLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [page, availabilityStart, availabilityEnd, fetchOtherBusyLists]);

  const slots = useMemo(() => {
    if (!page) return [];
    const durationMin =
      page.durationMode === "fixed" ? (selectedDuration ?? 30) : 30;
    const busyRanges = collectBusyRanges(
      hostBusyLists,
      availabilityStart.valueOf(),
      availabilityEnd.valueOf(),
    );
    return getDisplaySlots(
      page,
      availabilityStart.toDate(),
      availabilityEnd.toDate(),
      durationMin,
      new Date(),
      busyRanges,
    );
  }, [
    page,
    availabilityStart,
    availabilityEnd,
    selectedDuration,
    hostBusyLists,
  ]);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped: Record<string, IDisplaySlot[]> = {};
    for (const slot of slots) {
      const dateKey = dayjs(slot.start).format("YYYY-MM-DD");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(slot);
    }
    return grouped;
  }, [slots]);

  const calendarDays = useMemo(() => {
    const days: Dayjs[] = [];
    const start = monthStart.startOf("week");
    const end = monthEnd.subtract(1, "day").endOf("week");
    for (
      let day = start;
      day.isBefore(end, "day") || day.isSame(end, "day");
      day = day.add(1, "day")
    ) {
      days.push(day);
    }
    return days;
  }, [monthStart, monthEnd]);

  const selectedDaySlots = slotsByDate[selectedDate.format("YYYY-MM-DD")] ?? [];

  const navigateMonth = useCallback((direction: -1 | 1) => {
    setSelectedDate((d) => d.add(direction, "month").startOf("month"));
    setSelectedSlot(null);
  }, []);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setSelectedDate((d) => d.add(direction, "week"));
    setSelectedSlot(null);
  }, []);

  const selectDate = useCallback((date: Dayjs) => {
    if (date.isBefore(dayjs(), "day")) return;
    setSelectedDate(date);
    setSelectedSlot(null);
  }, []);

  const handleSlotClick = (slot: ITimeSlot) => {
    // Keep the public booking flow mounted across login and return the
    // visitor to the exact time they chose.
    setSelectedSlot(slot);
    if (!user) {
      setContinueAfterLogin(true);
      updateLoginModal(true);
      return;
    }
    setBookingDialogOpen(true);
  };

  useEffect(() => {
    if (!user || !continueAfterLogin || !selectedSlot) return;
    setContinueAfterLogin(false);
    setBookingDialogOpen(true);
  }, [continueAfterLogin, selectedSlot, user]);

  const handleBookingSubmit = async () => {
    if (!selectedSlot || !page || !naddr) return;

    setSubmitting(true);
    try {
      const schedulingPageRef = `${31927}:${page.user}:${page.id}`;
      const titleText =
        bookingTitle || page.eventTitle || `Meeting with ${page.title}`;

      // Generate a d-tag and view key for the future calendar event.
      // The creator will use both when publishing the event so it
      // appears correctly in the booker's calendar list from the start.
      const { dTag, viewKey } = createBookingIdentity(
        schedulingPageRef,
        selectedSlot.start.getTime(),
      );

      // Extract relay hints from the scheduling page event tags
      const relayHints = page.relayHints;

      const giftWrap = await sendBookingRequest({
        schedulingPageRef,
        creatorPubkey: page.user,
        start: selectedSlot.start.getTime(),
        end: selectedSlot.end.getTime(),
        title: titleText,
        pageName: page.title,
        note: bookingNote,
        dTag,
        viewKey,
        relayHints,
      });

      // Add the event reference to the booker's calendar list with the real
      // view key immediately — no placeholder needed since the key is known.
      if (selectedCalendarId) {
        const calendarLists = useCalendarLists.getState();
        const eventRef = buildEventRef({
          kind: EventKinds.PrivateCalendarEvent,
          authorPubkey: page.user,
          eventDTag: dTag,
          viewKey,
        });
        await calendarLists.addEventToCalendar(selectedCalendarId, eventRef);
      }

      // Store the outgoing booking locally so the Sent tab can display it
      const outgoing: IOutgoingBooking = {
        id: giftWrap.id,
        giftWrapId: giftWrap.id,
        schedulingPageRef,
        creatorPubkey: page.user,
        start: selectedSlot.start.getTime(),
        end: selectedSlot.end.getTime(),
        title: titleText,
        note: bookingNote,
        sentAt: Date.now(),
        status: "pending",
        dTag,
        viewKey,
      };
      useBookingRequests.getState().addOutgoingBooking(outgoing);

      setBookingDialogOpen(false);
      setBookingTitle("");
      setBookingNote("");
      navigate(ROUTES.Bookings);
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message:
          e instanceof Error ? e.message : "Failed to send booking request",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * A booking request must not be sent until every intake form attached to
   * the scheduling page has been submitted. Keeping the confirmation dialog
   * mounted underneath the form dialog also preserves the entered title,
   * note, calendar and slot while the guest answers the questions.
   */
  const handleBookingConfirm = () => {
    if (page?.formAttachments?.length) {
      setActiveFormIndex(0);
      return;
    }
    void handleBookingSubmit();
  };

  const handleFormSubmitted = () => {
    const nextIndex = (activeFormIndex ?? 0) + 1;
    const attachments = page?.formAttachments ?? [];
    if (nextIndex < attachments.length) {
      setActiveFormIndex(nextIndex);
      return;
    }
    setActiveFormIndex(null);
    void handleBookingSubmit();
  };

  const formatTime = (value: number | Date) => {
    if (!page) return "";
    // No `timeZone` option => the browser renders in the viewer's local tz,
    // which is exactly what we want. The host's tz is baked into the slot's
    // absolute timestamp via page.timezone during slot expansion.
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(value);
  };

  const timezoneFooter = useMemo(() => {
    const now = new Date();
    const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `Shown in your timezone (${formatUtcOffset(now, viewerTimeZone)}) · ${formatHostTime(now, page?.timezone || "UTC")} for the host.`;
  }, [page?.timezone]);

  if (fetchState === "loading") {
    return (
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
    );
  }

  if (fetchState === "error" || !page) {
    return (
      <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
        <Alert severity="error">
          {!viewKey
            ? intl.formatMessage({ id: "scheduling.publicPagesUnsupported" })
            : intl.formatMessage({ id: "scheduling.loadError" })}
        </Alert>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          minHeight: { md: "100%" },
          display: "flex",
          flexDirection: "column",
          alignItems: { md: "center" },
          maxWidth: 1160,
          mx: "auto",
          px: { xs: 0, sm: 3 },
          py: { xs: 0, md: 6 },
        }}
      >
        <Paper
          variant={isMobile ? "elevation" : "outlined"}
          elevation={0}
          sx={{
            width: "100%",
            overflow: "hidden",
            borderRadius: { xs: 0, md: 5 },
            boxShadow: { md: "0 20px 60px rgba(11, 11, 12, 0.12)" },
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "310px minmax(0, 1fr)" },
            }}
          >
            <Box
              sx={{
                p: { xs: 2.5, md: 4 },
                borderRight: { md: "1px solid" },
                borderBottom: { xs: "1px solid", md: 0 },
                borderColor: "divider",
                bgcolor: { xs: "background.paper", md: "action.hover" },
                textAlign: { xs: "center", md: "left" },
              }}
            >
              <CreatorInfo pubkey={page.user} />
              <Typography
                variant="h4"
                sx={{
                  mt: { xs: 2, md: 3 },
                  mb: 1.25,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                {page.title}
              </Typography>
              {page.description && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.65, mb: 2 }}
                >
                  {page.description}
                </Typography>
              )}
              {page.location && (
                <Chip
                  icon={<LocationOnIcon />}
                  label={page.location}
                  size="small"
                  variant="outlined"
                  sx={{ maxWidth: "100%" }}
                />
              )}

              {page.durationMode === "fixed" &&
                page.slotDurations.length > 1 && (
                  <Box sx={{ mt: { xs: 2.5, md: 3.5 } }}>
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ fontWeight: 800, letterSpacing: 1.2 }}
                    >
                      DURATION
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        mt: 0.75,
                        justifyContent: { xs: "center", md: "flex-start" },
                        flexWrap: "wrap",
                      }}
                    >
                      {page.slotDurations.map((mins) => (
                        <Button
                          key={mins}
                          size="small"
                          variant={
                            selectedDuration === mins ? "contained" : "outlined"
                          }
                          onClick={() => {
                            setSelectedDuration(mins);
                            setSelectedSlot(null);
                          }}
                          sx={{
                            minWidth: 76,
                            borderRadius: 99,
                            textTransform: "none",
                            fontWeight: 700,
                          }}
                        >
                          {mins >= 60 ? `${mins / 60} hr` : `${mins} min`}
                        </Button>
                      ))}
                    </Box>
                  </Box>
                )}
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "320px minmax(250px, 1fr)",
                },
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  p: { xs: 2.5, md: 4 },
                  borderBottom: { xs: "1px solid", md: 0 },
                  borderRight: { md: "1px solid" },
                  borderColor: "divider",
                }}
              >
                <Box sx={{ display: { xs: "block", md: "none" }, mb: 2.5 }}>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ fontWeight: 800, letterSpacing: 1.2 }}
                  >
                    BOOK A TIME
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}
                  >
                    Pick a time that works
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1.5,
                  }}
                >
                  <IconButton
                    onClick={() =>
                      isMobile ? navigateWeek(-1) : navigateMonth(-1)
                    }
                    size="small"
                    aria-label={isMobile ? "previous week" : "previous month"}
                  >
                    <ArrowBackIcon />
                  </IconButton>
                  <Typography variant="subtitle1" fontWeight={800}>
                    {isMobile
                      ? `${mobileWeekDays[0].format("MMM D")} – ${mobileWeekDays[6].format("MMM D, YYYY")}`
                      : selectedDate.format("MMMM YYYY")}
                  </Typography>
                  <IconButton
                    onClick={() =>
                      isMobile ? navigateWeek(1) : navigateMonth(1)
                    }
                    size="small"
                    aria-label={isMobile ? "next week" : "next month"}
                  >
                    <ArrowForwardIcon />
                  </IconButton>
                </Box>

                <Box sx={{ display: { xs: "none", md: "block" } }}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      mb: 0.5,
                    }}
                  >
                    {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                      <Typography
                        key={`${label}-${index}`}
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          textAlign: "center",
                          fontWeight: 700,
                          fontSize: "0.65rem",
                        }}
                      >
                        {label}
                      </Typography>
                    ))}
                  </Box>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, 1fr)",
                      gap: 0.5,
                    }}
                  >
                    {calendarDays.map((day) => {
                      const dateKey = day.format("YYYY-MM-DD");
                      const hasOpenSlot = (slotsByDate[dateKey] ?? []).some(
                        (slot) => !slot.unavailable,
                      );
                      const isSelected = day.isSame(selectedDate, "day");
                      const isPast = day.isBefore(dayjs(), "day");
                      return (
                        <Button
                          key={dateKey}
                          data-testid="booking-day-column"
                          data-date={dateKey}
                          onClick={() => selectDate(day)}
                          disabled={isPast || !hasOpenSlot}
                          aria-label={day.format("dddd, MMMM D")}
                          variant={isSelected ? "contained" : "text"}
                          sx={{
                            minWidth: 0,
                            height: 34,
                            p: 0,
                            borderRadius: 2,
                            bgcolor: isSelected
                              ? "primary.main"
                              : "transparent",
                            fontSize: "0.75rem",
                            fontWeight: isSelected ? 800 : 600,
                            position: "relative",
                            ...(!hasOpenSlot && {
                              opacity: 0.4,
                              textDecoration: "line-through",
                            }),
                            "&:hover": {
                              bgcolor: isSelected
                                ? "primary.main"
                                : "action.hover",
                            },
                            "&::after":
                              hasOpenSlot && !isSelected
                                ? {
                                    content: '""',
                                    position: "absolute",
                                    bottom: 3,
                                    width: 3,
                                    height: 3,
                                    borderRadius: "50%",
                                    bgcolor: "text.primary",
                                  }
                                : undefined,
                          }}
                        >
                          {day.date()}
                        </Button>
                      );
                    })}
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 2, lineHeight: 1.5 }}
                  >
                    Dates with a dot have open times.
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: { xs: "grid", md: "none" },
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: 0.75,
                  }}
                >
                  {mobileWeekDays.map((day) => {
                    const dateKey = day.format("YYYY-MM-DD");
                    const hasOpenSlot = (slotsByDate[dateKey] ?? []).some(
                      (slot) => !slot.unavailable,
                    );
                    const isSelected = day.isSame(selectedDate, "day");
                    const isPast = day.isBefore(dayjs(), "day");
                    return (
                      <Button
                        key={dateKey}
                        data-testid="booking-day-column"
                        data-date={dateKey}
                        onClick={() => selectDate(day)}
                        disabled={isPast || !hasOpenSlot}
                        variant={isSelected ? "contained" : "outlined"}
                        sx={{
                          minWidth: 0,
                          p: 0.5,
                          minHeight: 58,
                          borderRadius: 3,
                          border: "1px solid",
                          borderColor: isSelected ? "primary.main" : "divider",
                          bgcolor: isSelected
                            ? "primary.main"
                            : "background.paper",
                          flexDirection: "column",
                          position: "relative",
                          ...(!hasOpenSlot && {
                            opacity: 0.4,
                            textDecoration: "line-through",
                          }),
                        }}
                      >
                        <Typography
                          component="span"
                          sx={{
                            fontSize: "0.62rem",
                            opacity: isSelected ? 0.8 : 0.65,
                          }}
                        >
                          {day.format("ddd")}
                        </Typography>
                        <Typography
                          component="span"
                          sx={{ fontSize: "0.82rem", fontWeight: 800 }}
                        >
                          {day.date()}
                        </Typography>
                        {hasOpenSlot && (
                          <Box
                            component="span"
                            sx={{
                              width: 3,
                              height: 3,
                              borderRadius: "50%",
                              bgcolor: "currentColor",
                              mt: 0.25,
                            }}
                          />
                        )}
                      </Button>
                    );
                  })}
                </Box>
              </Box>

              <Box sx={{ p: { xs: 2.5, md: 4 }, minWidth: 0 }}>
                <Box sx={{ display: { xs: "none", md: "block" }, mb: 2.5 }}>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ fontWeight: 800, letterSpacing: 1.2 }}
                  >
                    BOOK A TIME
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}
                  >
                    Pick a time that works
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={800}>
                    {selectedDate.format("dddd, MMMM D")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {
                      selectedDaySlots.filter((slot) => !slot.unavailable)
                        .length
                    }{" "}
                    open
                  </Typography>
                </Box>
                {selectedDaySlots.length ? (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "repeat(2, minmax(0, 1fr))",
                        md: "1fr",
                      },
                      gap: 1.25,
                    }}
                  >
                    {selectedDaySlots.map((slot, index) => {
                      const disabled = !!slot.unavailable;
                      return (
                        <Button
                          key={index}
                          disabled={disabled}
                          variant={
                            selectedSlot === slot ? "contained" : "outlined"
                          }
                          onClick={() => !disabled && handleSlotClick(slot)}
                          sx={{
                            minHeight: 44,
                            borderRadius: 2.5,
                            textTransform: "none",
                            fontWeight: 700,
                            ...(disabled && {
                              opacity: 0.45,
                              textDecoration: "line-through",
                            }),
                          }}
                        >
                          {formatTime(slot.start)}
                        </Button>
                      );
                    })}
                  </Box>
                ) : (
                  <Box
                    sx={{
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 3,
                      p: 3,
                      textAlign: "center",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      No available times on this day.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Paper>
        <Typography
          component="footer"
          data-testid="booking-timezone-footer"
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", pt: 2, textAlign: "center" }}
        >
          {timezoneFooter}
        </Typography>
      </Box>

      {/* Booking Confirmation Dialog */}
      <Dialog
        open={bookingDialogOpen}
        onClose={() => setBookingDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {intl.formatMessage({ id: "scheduling.confirmBooking" })}
        </DialogTitle>
        <DialogContent>
          {selectedSlot && page && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Date & Time
                </Typography>
                <Typography variant="body1">
                  {dayjs(selectedSlot.start).format("dddd, MMMM D, YYYY")}
                </Typography>
                <Typography variant="body1">
                  {formatTime(selectedSlot.start)} –{" "}
                  {formatTime(selectedSlot.end)}
                </Typography>
              </Box>
              <TextField
                fullWidth
                label="Meeting title"
                placeholder={`Meeting with ${page.title}`}
                value={bookingTitle}
                onChange={(e) => setBookingTitle(e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label="Note (optional)"
                placeholder="Any additional information..."
                value={bookingNote}
                onChange={(e) => setBookingNote(e.target.value)}
                multiline
                rows={2}
                size="small"
              />
              <Box>
                <CalendarListSelect
                  value={selectedCalendarId}
                  onChange={setSelectedCalendarId}
                  label={intl.formatMessage({ id: "scheduling.addToCalendar" })}
                />
                {calendars.length === 0 && (
                  <Typography
                    variant="caption"
                    color="warning.main"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {intl.formatMessage({ id: "event.calendarRequired" })}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingDialogOpen(false)} color="inherit">
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            variant="contained"
            onClick={handleBookingConfirm}
            disabled={submitting || !selectedCalendarId}
          >
            {submitting
              ? intl.formatMessage({ id: "scheduling.sending" })
              : page?.formAttachments?.length
                ? "Answer some questions and confirm"
                : intl.formatMessage({ id: "scheduling.requestBooking" })}
          </Button>
        </DialogActions>
      </Dialog>

      <FormFillerDialog
        open={activeFormIndex !== null}
        attachment={
          activeFormIndex === null
            ? null
            : (page?.formAttachments?.[activeFormIndex] ?? null)
        }
        index={activeFormIndex === null ? undefined : activeFormIndex + 1}
        total={page?.formAttachments?.length}
        onClose={() => setActiveFormIndex(null)}
        onSubmitted={handleFormSubmitted}
        onUseExistingSubmission={handleFormSubmitted}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
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

/** Sub-component that shows the scheduling page creator's profile */
function CreatorInfo({ pubkey }: { pubkey: string }) {
  const { participant, loading } = useGetParticipant({ pubKey: pubkey });

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Skeleton variant="circular" width={44} height={44} />
        <Skeleton width={120} height={24} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        justifyContent: { xs: "center", md: "flex-start" },
      }}
    >
      <Avatar src={participant.picture} sx={{ width: 44, height: 44 }}>
        {participant.name?.charAt(0)?.toUpperCase() || "?"}
      </Avatar>
      <Typography variant="subtitle1">
        {participant.name || pubkey.slice(0, 12) + "..."}
      </Typography>
    </Box>
  );
}
