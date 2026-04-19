import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  Paper,
  Chip,
  Avatar,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Toolbar,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { useBookingRequests } from "../stores/bookingRequests";
import { useSchedulingPages } from "../stores/schedulingPages";
import { useCalendarLists } from "../stores/calendarLists";
import { useGetParticipant } from "../stores/participants";
import { Header } from "./Header";
import { CalendarListSelect } from "./CalendarListSelect";
import { ROUTES } from "../utils/routingHelper";
import type { IBookingRequest, IOutgoingBooking } from "../utils/types";

const STATUS_COLORS: Record<
  string,
  "default" | "success" | "error" | "warning" | "info"
> = {
  pending: "warning",
  approved: "success",
  declined: "error",
  expired: "default",
  cancelled: "default",
};

export const BookingsPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState(0);

  const {
    incomingRequests,
    outgoingBookings,
    isLoaded,
    loadCached,
  } = useBookingRequests();

  const { pages } = useSchedulingPages();
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();

  // Load cached data on mount. Network fetching is handled by App.tsx
  // which calls fetchIncomingRequests/fetchOutgoingBookings at login.
  // Those are persistent WebSocket subscriptions — new events are
  // automatically pushed to the store without polling.
  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // Sort by receivedAt descending (latest first)
  const sortedIncoming = [...incomingRequests].sort(
    (a, b) => b.receivedAt - a.receivedAt,
  );
  const pendingIncoming = sortedIncoming.filter((r) => r.status === "pending");
  const resolvedIncoming = sortedIncoming.filter((r) => r.status !== "pending");

  return (
    <>
      <Header />
      <Toolbar />
      <Box sx={{ maxWidth: 900, mx: "auto", p: isMobile ? 2 : 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h5">Bookings</Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => navigate(ROUTES.SchedulingPageCreate)}
          >
            New Page
          </Button>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab
            label={`Incoming${pendingIncoming.length > 0 ? ` (${pendingIncoming.length})` : ""}`}
          />
          <Tab label="Sent" />
        </Tabs>

        {!isLoaded ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : tab === 0 ? (
          <IncomingTab
            pending={pendingIncoming}
            resolved={resolvedIncoming}
            pages={pages}
            calendars={calendars}
            calendarsLoaded={calendarsLoaded}
          />
        ) : (
          <OutgoingTab bookings={outgoingBookings} />
        )}
      </Box>
    </>
  );
};

/* ─── Incoming Tab ─────────────────────────────────────── */

interface IncomingTabProps {
  pending: IBookingRequest[];
  resolved: IBookingRequest[];
  pages: ReturnType<typeof useSchedulingPages.getState>["pages"];
  calendars: ReturnType<typeof useCalendarLists.getState>["calendars"];
  calendarsLoaded: boolean;
}

function IncomingTab({
  pending,
  resolved,
  pages,
  calendars,
  calendarsLoaded,
}: IncomingTabProps) {
  if (pending.length === 0 && resolved.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography color="text.secondary">
          No booking requests yet. Share your scheduling page link to start
          receiving requests.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {pending.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Pending ({pending.length})
          </Typography>
          {pending.map((req) => (
            <IncomingRequestCard
              key={req.id}
              request={req}
              pages={pages}
              calendars={calendars}
              calendarsLoaded={calendarsLoaded}
            />
          ))}
        </>
      )}

      {resolved.length > 0 && (
        <>
          {pending.length > 0 && <Divider sx={{ my: 2 }} />}
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            History
          </Typography>
          {resolved.map((req) => (
            <IncomingRequestCard
              key={req.id}
              request={req}
              pages={pages}
              calendars={calendars}
              calendarsLoaded={calendarsLoaded}
            />
          ))}
        </>
      )}
    </Box>
  );
}

/* ─── Incoming Request Card ────────────────────────────── */

function IncomingRequestCard({
  request,
  pages,
  calendars,
  calendarsLoaded,
}: {
  request: IBookingRequest;
  pages: IncomingTabProps["pages"];
  calendars: IncomingTabProps["calendars"];
  calendarsLoaded: boolean;
}) {
  const { participant, loading } = useGetParticipant({
    pubKey: request.bookerPubkey,
  });
  const { approveRequest, declineRequest } = useBookingRequests();

  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    calendars[0]?.id || "",
  );
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Find which scheduling page this request is for
  const pageRef = request.schedulingPageRef;
  const pageId = pageRef.split(":")[2] || "";
  const matchingPage = pages.find((p) => p.id === pageId);

  const handleApprove = async () => {
    if (!selectedCalendarId) {
      setErrorMsg(
        "Please select a calendar first. If none appear, create one from the sidebar.",
      );
      return;
    }
    setProcessing(true);
    setErrorMsg("");
    try {
      await approveRequest(request.id, selectedCalendarId);
      setApproveDialogOpen(false);
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Failed to approve booking. Please try again.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    setErrorMsg("");
    try {
      await declineRequest(request.id, declineReason || undefined);
      setDeclineDialogOpen(false);
      setDeclineReason("");
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Failed to decline booking. Please try again.",
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          {loading ? (
            <Skeleton variant="circular" width={36} height={36} />
          ) : (
            <Avatar src={participant.picture} sx={{ width: 36, height: 36 }}>
              {participant.name?.charAt(0)?.toUpperCase() || "?"}
            </Avatar>
          )}
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {loading ? (
                <Skeleton width={80} />
              ) : (
                participant.name || request.bookerPubkey.slice(0, 12) + "..."
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {request.title}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={request.status}
          size="small"
          color={STATUS_COLORS[request.status] || "default"}
        />
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <Typography variant="body2">
          {dayjs(request.start).format("ddd, MMM D, YYYY")} &middot;{" "}
          {dayjs(request.start).format("h:mm A")} –{" "}
          {dayjs(request.end).format("h:mm A")}
        </Typography>
        {matchingPage && (
          <Typography variant="caption" color="text.secondary">
            Page: {matchingPage.title}
          </Typography>
        )}
        {request.note && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, fontStyle: "italic" }}
          >
            "{request.note}"
          </Typography>
        )}
      </Box>

      {request.status === "pending" && (
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setApproveDialogOpen(true)}
            disabled={processing}
          >
            Approve
          </Button>
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => setDeclineDialogOpen(true)}
            disabled={processing}
          >
            Decline
          </Button>
        </Box>
      )}

      {request.status === "declined" && request.declineReason && (
        <Typography
          variant="caption"
          color="error"
          sx={{ mt: 1, display: "block" }}
        >
          Reason: {request.declineReason}
        </Typography>
      )}

      {/* Approve Dialog */}
      <Dialog
        open={approveDialogOpen}
        onClose={() => setApproveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Approve Booking</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This will create a private calendar event and notify the booker.
          </Typography>
          {calendarsLoaded && calendars.length > 0 ? (
            <CalendarListSelect
              value={selectedCalendarId}
              onChange={setSelectedCalendarId}
              label="Add to calendar"
            />
          ) : (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              No calendars found. Please create a calendar first from the
              sidebar.
            </Typography>
          )}
          {errorMsg && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {errorMsg}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleApprove}
            disabled={processing || !selectedCalendarId}
          >
            {processing ? "Approving..." : "Approve"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog
        open={declineDialogOpen}
        onClose={() => setDeclineDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Decline Booking</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Reason (optional)"
            placeholder="Let them know why..."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            multiline
            rows={2}
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclineDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDecline}
            disabled={processing}
          >
            {processing ? "Declining..." : "Decline"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

/* ─── Outgoing Tab ─────────────────────────────────────── */

function OutgoingTab({ bookings }: { bookings: IOutgoingBooking[] }) {
  if (bookings.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography color="text.secondary">
          No sent booking requests yet. Book an appointment using someone's
          scheduling page link.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {bookings.map((booking) => (
        <OutgoingBookingCard key={booking.id} booking={booking} />
      ))}
    </Box>
  );
}

function OutgoingBookingCard({ booking }: { booking: IOutgoingBooking }) {
  const { participant, loading } = useGetParticipant({
    pubKey: booking.creatorPubkey,
  });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          {loading ? (
            <Skeleton variant="circular" width={36} height={36} />
          ) : (
            <Avatar src={participant.picture} sx={{ width: 36, height: 36 }}>
              {participant.name?.charAt(0)?.toUpperCase() || "?"}
            </Avatar>
          )}
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {loading ? (
                <Skeleton width={80} />
              ) : (
                participant.name || booking.creatorPubkey.slice(0, 12) + "..."
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {booking.title}
            </Typography>
          </Box>
        </Box>
        <Chip
          label={booking.status}
          size="small"
          color={STATUS_COLORS[booking.status] || "default"}
        />
      </Box>

      <Box sx={{ mt: 1.5 }}>
        <Typography variant="body2">
          {dayjs(booking.start).format("ddd, MMM D, YYYY")} &middot;{" "}
          {dayjs(booking.start).format("h:mm A")} –{" "}
          {dayjs(booking.end).format("h:mm A")}
        </Typography>
        {booking.note && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, fontStyle: "italic" }}
          >
            "{booking.note}"
          </Typography>
        )}
      </Box>

      {booking.status === "declined" && booking.declineReason && (
        <Typography
          variant="caption"
          color="error"
          sx={{ mt: 1, display: "block" }}
        >
          Reason: {booking.declineReason}
        </Typography>
      )}

      {booking.status === "approved" && booking.respondedAt && (
        <Typography
          variant="caption"
          color="success.main"
          sx={{ mt: 1, display: "block" }}
        >
          Approved {dayjs(booking.respondedAt).fromNow()}
        </Typography>
      )}
    </Paper>
  );
}
