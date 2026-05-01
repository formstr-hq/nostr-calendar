import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "react-router";
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
import {
  getUserPublicKey,
  getRelays,
  publishToRelays,
  defaultRelays,
} from "../common/nostr";
import * as nip59 from "../common/nip59";
import { nostrRuntime } from "../common/nostrRuntime";
import { EventKinds } from "../common/EventConfigs";
import { nostrEventToSchedulingPage } from "../utils/parser";
import { getDisplaySlots, type IDisplaySlot } from "../utils/availabilityHelper";
import { useBusyList, collectBusyRanges } from "../stores/busyList";
import { busyListMonthKeysForRange } from "../utils/dateHelper";
import type { IBusyList } from "../utils/types";
import { useGetParticipant } from "../stores/participants";
import { useUser } from "../stores/user";
import { useBookingRequests } from "../stores/bookingRequests";
import { useCalendarLists } from "../stores/calendarLists";
import { buildEventRef } from "../utils/calendarListTypes";
import { Header, HEADER_HEIGHT } from "./Header";
import { CalendarListSelect } from "./CalendarListSelect";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { nip44, getPublicKey } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { Event, Filter } from "nostr-tools";
import type {
  ISchedulingPage,
  ITimeSlot,
  IOutgoingBooking,
} from "../utils/types";

async function fetchSchedulingPage(naddr: NAddr): Promise<Event> {
  const { data } = decode(naddr as NAddr);
  const relays = data.relays ?? defaultRelays;
  const filter: Filter = {
    "#d": [data.identifier],
    kinds: [EventKinds.SchedulingPage],
    authors: [data.pubkey],
  };
  const event = await nostrRuntime.fetchOne(relays, filter);
  if (!event) throw new Error("SCHEDULING_PAGE_NOT_FOUND");
  return event;
}

async function sendBookingRequest({
  schedulingPageRef,
  creatorPubkey,
  start,
  end,
  title,
  note,
  dTag,
  relayHints,
}: {
  schedulingPageRef: string;
  creatorPubkey: string;
  start: number;
  end: number;
  title: string;
  note: string;
  dTag: string;
  relayHints?: string[];
}): Promise<Event> {
  const userPublicKey = await getUserPublicKey();
  const giftWrap = await nip59.wrapEvent(
    {
      pubkey: userPublicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: EventKinds.BookingRequestRumor,
      content: "",
      tags: [
        ["a", schedulingPageRef],
        ["start", String(Math.floor(start / 1000))],
        ["end", String(Math.floor(end / 1000))],
        ["title", title],
        ["note", note],
        ["d", dTag],
      ],
    },
    creatorPubkey,
    EventKinds.BookingRequestGiftWrap,
  );
  const targetRelays = relayHints
    ? [...new Set([...relayHints, ...getRelays()])]
    : undefined;
  await publishToRelays(giftWrap, undefined, targetRelays);
  return giftWrap;
}

type FetchState = "loading" | "loaded" | "error";

export const BookingPage = () => {
  const { naddr } = useParams<{ naddr: string }>();
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
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingNote, setBookingNote] = useState("");
  const [bookingTitle, setBookingTitle] = useState("");
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

  // Fetch scheduling page data
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
    fetchSchedulingPage(naddr as NAddr)
      .then((event) => {
        let eventToProcess = event;
        try {
          const viewSecretKey = hexToBytes(viewKey);
          const viewPublicKey = getPublicKey(viewSecretKey);
          const conversationKey = nip44.getConversationKey(
            viewSecretKey,
            viewPublicKey,
          );
          const decryptedTags = JSON.parse(
            nip44.decrypt(event.content, conversationKey),
          );
          eventToProcess = { ...event, tags: decryptedTags };
        } catch {
          setFetchState("error");
          return;
        }
        const parsed = nostrEventToSchedulingPage(eventToProcess);
        setPage(parsed);
        // Default to first slot duration if fixed mode
        if (
          parsed.durationMode === "fixed" &&
          parsed.slotDurations.length > 0
        ) {
          setSelectedDuration(parsed.slotDurations[0]);
        }
        setFetchState("loaded");
      })
      .catch((e) => {
        console.error(e);
        setFetchState("error");
      });
  }, [naddr, viewKey]);

  // Compute available slots for the displayed week
  const weekStart = useMemo(() => selectedDate.startOf("week"), [selectedDate]);
  const weekEnd = useMemo(() => weekStart.add(7, "day"), [weekStart]);

  // Public busy lists (kind 31926) for the host, scoped to the visible week.
  // Slots overlapping any of these ranges are filtered out by getBookableSlots.
  const fetchOtherBusyLists = useBusyList((s) => s.fetchBusyListsForUser);
  const [hostBusyLists, setHostBusyLists] = useState<IBusyList[]>([]);
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    const monthKeys = busyListMonthKeysForRange(
      weekStart.valueOf(),
      weekEnd.valueOf(),
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
  }, [page, weekStart, weekEnd, fetchOtherBusyLists]);

  const slots = useMemo(() => {
    if (!page) return [];
    const durationMin =
      page.durationMode === "fixed" ? (selectedDuration ?? 30) : 30;
    const busyRanges = collectBusyRanges(
      hostBusyLists,
      weekStart.valueOf(),
      weekEnd.valueOf(),
    );
    return getDisplaySlots(
      page,
      weekStart.toDate(),
      weekEnd.toDate(),
      durationMin,
      new Date(),
      busyRanges,
    );
  }, [page, weekStart, weekEnd, selectedDuration, hostBusyLists]);

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

  // Days to display (the 7 days of the selected week)
  const weekDays = useMemo(() => {
    const days: Dayjs[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(weekStart.add(i, "day"));
    }
    return days;
  }, [weekStart]);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setSelectedDate((d) => d.add(direction * 7, "day"));
    setSelectedSlot(null);
  }, []);

  const handleSlotClick = (slot: ITimeSlot) => {
    if (!user) {
      updateLoginModal(true);
      return;
    }
    setSelectedSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingSubmit = async () => {
    if (!selectedSlot || !page || !naddr) return;

    setSubmitting(true);
    try {
      const schedulingPageRef = `${31927}:${page.user}:${page.id}`;
      const titleText =
        bookingTitle || page.eventTitle || `Meeting with ${page.title}`;

      // Generate a d-tag for the future calendar event.
      // The creator will use this d-tag when creating the event so it
      // automatically resolves in the booker's calendar list.
      const dTagRoot = `booking-${schedulingPageRef}-${selectedSlot.start.getTime()}-${Date.now()}`;
      const dTag = bytesToHex(sha256(utf8ToBytes(dTagRoot))).substring(0, 30);

      // Extract relay hints from the scheduling page event tags
      const relayHints = page.relayHints;

      const giftWrap = await sendBookingRequest({
        schedulingPageRef,
        creatorPubkey: page.user,
        start: selectedSlot.start.getTime(),
        end: selectedSlot.end.getTime(),
        title: titleText,
        note: bookingNote,
        dTag,
        relayHints,
      });

      // Add a placeholder event reference to the booker's calendar list.
      // When the creator approves and publishes the event using this d-tag,
      // the invitation gift wrap will provide the viewKey for decryption.
      if (selectedCalendarId) {
        const calendarLists = useCalendarLists.getState();
        const eventRef = buildEventRef({
          kind: EventKinds.PrivateCalendarEvent,
          authorPubkey: page.user,
          eventDTag: dTag,
          viewKey: "",
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
      };
      useBookingRequests.getState().addOutgoingBooking(outgoing);

      setBookingDialogOpen(false);
      setSelectedSlot(null);
      setBookingTitle("");
      setBookingNote("");
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: "scheduling.bookingRequestSent" }),
        severity: "success",
      });
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

  if (fetchState === "loading") {
    return (
      <>
        <Header />
        <Box sx={{ height: `${HEADER_HEIGHT}px` }} />
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

  if (fetchState === "error" || !page) {
    return (
      <>
        <Header />
        <Box sx={{ height: `${HEADER_HEIGHT}px` }} />
        <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
          <Alert severity="error">
            {!viewKey
              ? intl.formatMessage({ id: "scheduling.publicPagesUnsupported" })
              : intl.formatMessage({ id: "scheduling.loadError" })}
          </Alert>
        </Box>
      </>
    );
  }

  return (
    <>
      <Header />
      <Box sx={{ height: `${HEADER_HEIGHT}px` }} />
      <Box
        sx={{
          maxWidth: 900,
          mx: "auto",
          px: isMobile ? 2 : 3,
          pt: 0.5,
          pb: isMobile ? 2 : 3,
        }}
      >
        {/* Creator Profile & Page Info */}
        <CreatorInfo pubkey={page.user} />

        <Typography variant="h5" sx={{ mt: 1, mb: 1 }}>
          {page.title}
        </Typography>

        {page.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {page.description}
          </Typography>
        )}

        {page.location && (
          <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
            <Chip
              icon={<LocationOnIcon />}
              label={page.location}
              size="small"
              variant="outlined"
            />
          </Box>
        )}

        {/* Duration selector (for fixed-duration mode) */}
        {page.durationMode === "fixed" && page.slotDurations.length > 1 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {intl.formatMessage({ id: "scheduling.selectDuration" })}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {page.slotDurations.map((mins) => (
                <Chip
                  key={mins}
                  label={mins >= 60 ? `${mins / 60} hr` : `${mins} min`}
                  color={selectedDuration === mins ? "primary" : "default"}
                  variant={selectedDuration === mins ? "filled" : "outlined"}
                  onClick={() => {
                    setSelectedDuration(mins);
                    setSelectedSlot(null);
                  }}
                />
              ))}
            </Box>
          </Paper>
        )}

        {/* Week navigation */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <IconButton onClick={() => navigateWeek(-1)} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1">
            {weekStart.format("MMM D")} –{" "}
            {weekEnd.subtract(1, "day").format("MMM D, YYYY")}
          </Typography>
          <IconButton onClick={() => navigateWeek(1)} size="small">
            <ArrowForwardIcon />
          </IconButton>
        </Box>

        {/* Slots grid */}
        <Box
          sx={{
            overflowX: { xs: "auto", md: "visible" },
            mx: { xs: -2, md: 0 },
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(7, minmax(130px, 1fr))",
                md: "repeat(7, minmax(0, 1fr))",
              },
              gap: 1.5,
              minWidth: { xs: "min-content", md: "auto" },
              px: { xs: 2, md: 0 },
              pb: { xs: 0.5, md: 0 },
            }}
          >
            {weekDays.map((day) => {
              const dateKey = day.format("YYYY-MM-DD");
              const daySlots = slotsByDate[dateKey] || [];
              const isToday = day.isSame(dayjs(), "day");
              const isPast = day.isBefore(dayjs(), "day");

              return (
                <Paper
                  key={dateKey}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    minHeight: 120,
                    opacity: isPast ? 0.5 : 1,
                    backgroundColor: isToday
                      ? "action.hover"
                      : "background.paper",
                  }}
                >
                  <Typography
                    variant="caption"
                    fontWeight={isToday ? 700 : 400}
                    sx={{ display: "block", mb: 1, textAlign: "center" }}
                  >
                    {day.format("ddd")}
                    <br />
                    {day.format("MMM D")}
                  </Typography>
                  {daySlots.length === 0 ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", textAlign: "center" }}
                    >
                      —
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                      }}
                    >
                      {daySlots.map((slot, i) => {
                        const disabled = !!slot.unavailable;
                        return (
                          <Button
                            key={i}
                            size="small"
                            disabled={disabled}
                            variant={
                              selectedSlot === slot ? "contained" : "outlined"
                            }
                            onClick={() =>
                              disabled ? undefined : handleSlotClick(slot)
                            }
                            sx={{
                              fontSize: "0.7rem",
                              py: 0.25,
                              px: 0.5,
                              minWidth: 0,
                              textTransform: "none",
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
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>

        {slots.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">
              {intl.formatMessage({ id: "scheduling.noSlotsThisWeek" })}
            </Typography>
          </Box>
        )}
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
              <CalendarListSelect
                value={selectedCalendarId}
                onChange={setSelectedCalendarId}
                label={intl.formatMessage({ id: "scheduling.addToCalendar" })}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingDialogOpen(false)} color="inherit">
            {intl.formatMessage({ id: "navigation.cancel" })}
          </Button>
          <Button
            variant="contained"
            onClick={handleBookingSubmit}
            disabled={submitting || !selectedCalendarId}
          >
            {submitting
              ? intl.formatMessage({ id: "scheduling.sending" })
              : intl.formatMessage({ id: "scheduling.requestBooking" })}
          </Button>
        </DialogActions>
      </Dialog>

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
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Avatar src={participant.picture} sx={{ width: 44, height: 44 }}>
        {participant.name?.charAt(0)?.toUpperCase() || "?"}
      </Avatar>
      <Typography variant="subtitle1">
        {participant.name || pubkey.slice(0, 12) + "..."}
      </Typography>
    </Box>
  );
}
