import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import VerifiedIcon from "@mui/icons-material/Verified";
import { useBookingRequests } from "../../stores/bookingRequests";
import { useSchedulingPages } from "../../stores/schedulingPages";
import { useCalendarLists } from "../../stores/calendarLists";
import { useGetParticipant } from "../../stores/participants";
import { useBusyList } from "../../stores/busyList";
import { CalendarListSelect } from "../../components/CalendarListSelect";
import { FormAttachmentRow } from "../../components/FormAttachmentRow";
import { verifyNip05 } from "../../nostr/nip05";
import { ROUTES } from "../../utils/routingHelper";
import { getRelays } from "../../common/relayConfig";
import { publishSignedEvent } from "../../nostr/core";
import { publishCalendarList } from "../../nostr/calendars";
import {
  usePublishActivity,
  usePublishActivityStore,
  type PublishStepDefinition,
} from "../../stores/publishActivity";
import { PublishActivityPanel } from "../../components/PublishActivityPanel";
import { PublishActivityDialog } from "../../components/PublishActivityDialog";
import { useIntl } from "react-intl";
import type { BookingApprovalPublishResult } from "../../stores/bookingRequests";
import type {
  IBookingRequest,
  IOutgoingBooking,
  ISchedulingPage,
} from "../../utils/types";

type Item =
  | { kind: "incoming"; value: IBookingRequest }
  | { kind: "outgoing"; value: IOutgoingBooking };
type Bucket = "pending" | "upcoming" | "resolved";
const colors: Record<string, "default" | "warning" | "success" | "error"> = {
  pending: "warning",
  approved: "success",
  declined: "error",
  expired: "default",
  cancelled: "default",
};

function bucket(item: Item): Bucket {
  if (item.value.status === "pending") return "pending";
  return item.value.status === "approved" && item.value.start > Date.now()
    ? "upcoming"
    : "resolved";
}
function label(item: Item) {
  return item.value.title || "Booking";
}
function requester(item: Item) {
  return item.kind === "incoming"
    ? item.value.bookerPubkey
    : item.value.creatorPubkey;
}

export function BookingInbox() {
  const navigate = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [pageFilter, setPageFilter] = useState("all");
  const [selected, setSelected] = useState<Item | null>(null);
  const { incomingRequests, outgoingBookings, isLoaded, loadCached } =
    useBookingRequests();
  const { pages } = useSchedulingPages();
  useEffect(() => {
    void loadCached();
  }, [loadCached]);
  const items = useMemo<Item[]>(
    () =>
      (tab === "incoming"
        ? incomingRequests.map((value) => ({
            kind: "incoming" as const,
            value,
          }))
        : outgoingBookings.map((value) => ({
            kind: "outgoing" as const,
            value,
          }))
      )
        .filter(
          (item) =>
            pageFilter === "all" ||
            ("schedulingPageRef" in item.value &&
              item.value.schedulingPageRef.split(":")[2] === pageFilter),
        )
        .sort(
          (a, b) =>
            ("receivedAt" in b.value ? b.value.receivedAt : b.value.sentAt) -
            ("receivedAt" in a.value ? a.value.receivedAt : a.value.sentAt),
        ),
    [tab, incomingRequests, outgoingBookings, pageFilter],
  );
  // The mobile design opens the most urgent request first; desktop uses the
  // same initial detail selection so the two layouts feel consistent.
  useEffect(
    () =>
      setSelected(
        items.find((item) => bucket(item) === "pending") ?? items[0] ?? null,
      ),
    [items],
  );
  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", p: mobile ? 2 : 4 }}>
      <Stack
        direction={mobile ? "column" : "row"}
        justifyContent="space-between"
        alignItems={mobile ? "stretch" : "flex-end"}
        spacing={2}
        mb={3}
      >
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            fontWeight={800}
          >
            SCHEDULING
          </Typography>
          <Typography variant="h3" fontWeight={800} letterSpacing="-0.03em">
            Bookings
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Review requests, resolve conflicts, and keep upcoming meetings on
            track.
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => navigate(ROUTES.SchedulingPageCreate)}
        >
          New page
        </Button>
      </Stack>
      <Stack
        direction={mobile ? "column" : "row"}
        spacing={2}
        mb={2}
        alignItems={mobile ? "stretch" : "center"}
      >
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 44 }}>
          <Tab
            value="incoming"
            label={`Incoming${incomingRequests.filter((r) => r.status === "pending").length ? ` (${incomingRequests.filter((r) => r.status === "pending").length})` : ""}`}
          />
          <Tab value="outgoing" label="Outgoing" />
        </Tabs>
        {tab === "incoming" && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="booking-page-filter">Booking page</InputLabel>
            <Select
              labelId="booking-page-filter"
              label="Booking page"
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
            >
              <MenuItem value="all">All pages</MenuItem>
              {pages.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>
      {!isLoaded ? (
        <Box textAlign="center" py={8}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 8, textAlign: "center" }}>
          <Typography color="text.secondary">
            No {tab === "incoming" ? "booking requests" : "outgoing bookings"}{" "}
            here yet.
          </Typography>
        </Paper>
      ) : mobile ? (
        <MobileList
          items={items}
          selected={selected}
          onSelect={setSelected}
          pages={pages}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(330px, .8fr) minmax(460px, 1.4fr)",
            gap: 3,
            alignItems: "start",
          }}
        >
          <BookingListPane
            items={items}
            selected={selected}
            onSelect={setSelected}
            pages={pages}
          />
          <BookingDetailPanel item={selected} pages={pages} />
        </Box>
      )}
    </Box>
  );
}

function BookingListPane({
  items,
  selected,
  onSelect,
  pages,
}: {
  items: Item[];
  selected: Item | null;
  onSelect: (item: Item) => void;
  pages: ISchedulingPage[];
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", borderRadius: 3 }}>
      {(["pending", "upcoming", "resolved"] as Bucket[]).map((group, i) => {
        const rows = items.filter((x) => bucket(x) === group);
        if (!rows.length) return null;
        return (
          <Box key={group}>
            {i > 0 && <Divider />}
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{
                px: 2,
                pt: 2,
                pb: 0.5,
                display: "block",
                fontWeight: 800,
                letterSpacing: 1.1,
              }}
            >
              {group} ({rows.length})
            </Typography>
            {rows.map((item) => (
              <BookingRow
                key={`${item.kind}-${item.value.id}`}
                item={item}
                active={selected?.value.id === item.value.id}
                onClick={() => onSelect(item)}
                page={pages.find(
                  (p) => p.id === item.value.schedulingPageRef.split(":")[2],
                )}
              />
            ))}
          </Box>
        );
      })}
    </Paper>
  );
}
function BookingRow({
  item,
  active,
  onClick,
  page,
}: {
  item: Item;
  active: boolean;
  onClick: () => void;
  page?: ISchedulingPage;
}) {
  const { participant, loading } = useGetParticipant({
    pubKey: requester(item),
  });
  return (
    <Box
      component="button"
      data-testid="booking-request-card"
      onClick={onClick}
      sx={{
        display: "flex",
        width: "100%",
        textAlign: "left",
        border: 0,
        borderLeft: active ? 3 : 3,
        borderColor: active ? "primary.main" : "transparent",
        bgcolor: active ? "action.selected" : "transparent",
        p: 2,
        gap: 1.25,
        cursor: "pointer",
        transition: "background-color .15s ease, border-color .15s ease",
        "&:hover": { bgcolor: "action.hover", borderColor: "primary.light" },
      }}
    >
      <>
        {loading ? (
          <Skeleton variant="circular" width={36} height={36} />
        ) : (
          <Avatar src={participant.picture}>
            {participant.name?.[0] ?? "?"}
          </Avatar>
        )}
      </>
      <Box minWidth={0} flexGrow={1}>
        <Typography fontWeight={600} noWrap>
          {loading ? (
            <Skeleton width={100} />
          ) : (
            participant.name || requester(item).slice(0, 12) + "…"
          )}
        </Typography>
        <Typography variant="body2" noWrap>
          {label(item)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dayjs(item.value.start).format("MMM D, h:mm A")}
          {page ? ` · ${page.title}` : ""}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={item.value.status}
        color={colors[item.value.status]}
      />
    </Box>
  );
}
function MobileList({
  items,
  selected,
  onSelect,
  pages,
}: {
  items: Item[];
  selected: Item | null;
  onSelect: (item: Item) => void;
  pages: ISchedulingPage[];
}) {
  return (
    <Stack spacing={1}>
      {items.map((item) => (
        <Paper key={`${item.kind}-${item.value.id}`} variant="outlined">
          <BookingRow
            item={item}
            active={selected?.value.id === item.value.id}
            onClick={() => onSelect(item)}
            page={pages.find(
              (p) => p.id === item.value.schedulingPageRef.split(":")[2],
            )}
          />
          {selected?.value.id === item.value.id && (
            <Box p={2} pt={0}>
              <BookingDetailPanel item={item} pages={pages} embedded />
            </Box>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

function BookingDetailPanel({
  item,
  pages,
  embedded = false,
}: {
  item: Item | null;
  pages: ISchedulingPage[];
  embedded?: boolean;
}) {
  const intl = useIntl();
  const { participant, loading } = useGetParticipant({
    pubKey: item ? requester(item) : "",
  });
  const { calendars, isLoaded: calendarsLoaded } = useCalendarLists();
  const {
    approveRequest,
    declineRequest,
    dismissIncomingRequest,
    dismissOutgoingBooking,
  } = useBookingRequests();
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const approvalFlowId = item
    ? `booking-approve:${item.value.id}`
    : "booking-approve";
  const approvalFlow = usePublishActivity(approvalFlowId);
  const approvalSteps = approvalFlow?.steps ?? [];
  const page = item
    ? pages.find((p) => p.id === item.value.schedulingPageRef.split(":")[2])
    : undefined;
  const ownLists = useBusyList((s) => s.ownLists);
  const conflict =
    !!item &&
    Object.values(ownLists).some((list) =>
      list.ranges.some(
        (r) => r.start < item.value.end && r.end > item.value.start,
      ),
    );
  useEffect(() => {
    setVerified(false);
    if (participant.nip05 && item)
      void verifyNip05(participant.nip05, requester(item)).then(setVerified);
  }, [participant.nip05, item]);
  useEffect(() => {
    if (!calendarId && calendars[0]) setCalendarId(calendars[0].id);
  }, [calendarId, calendars]);
  if (!item)
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          Select a booking to view its details.
        </Typography>
      </Paper>
    );
  const incoming = item.kind === "incoming";
  const resolved = bucket(item) === "resolved";
  const act = async (action: "approve" | "decline") => {
    if (!incoming) return;
    setWorking(true);
    setError("");
    try {
      if (action === "approve") {
        if (!calendarId) throw new Error("Choose a calendar first.");
        const relays = getRelays();
        let approvalResult: BookingApprovalPublishResult | undefined;
        let invitationStepStarted = false;
        let calendarStepStarted = false;
        let responseStepStarted = false;
        const steps: PublishStepDefinition[] = [
          {
            id: "publish-appointment",
            labelId: "booking.step.publishAppointment",
            relays,
            blocking: true,
            run: async (callbacks) => {
              if (approvalResult) {
                await publishSignedEvent(approvalResult.calendarEvent, {
                  onRelayComplete: callbacks.onRelayComplete,
                });
                return;
              }
              approvalResult = await approveRequest(item.value.id, calendarId, {
                onEventRelayComplete: callbacks.onRelayComplete,
                onInvitationRelayComplete: (url, success) =>
                  callbacks.reportRelayOutcome("send-invitation", url, success),
                onCalendarRelayComplete: (url, success) =>
                  callbacks.reportRelayOutcome("add-to-calendar", url, success),
                onResponseRelayComplete: (url, success) =>
                  callbacks.reportRelayOutcome("send-approval", url, success),
              });
            },
          },
          {
            id: "send-invitation",
            labelId: "booking.step.sendInvitation",
            relays,
            blocking: true,
            run: async (callbacks) => {
              if (!invitationStepStarted) {
                invitationStepStarted = true;
                return;
              }
              if (!approvalResult) return;
              await Promise.all(
                approvalResult.invitationGiftWraps.map((giftWrap) =>
                  publishSignedEvent(giftWrap, {
                    onRelayComplete: callbacks.onRelayComplete,
                  }),
                ),
              );
            },
          },
          {
            id: "add-to-calendar",
            labelId: "booking.step.addToCalendar",
            relays,
            blocking: true,
            run: async (callbacks) => {
              if (!calendarStepStarted) {
                calendarStepStarted = true;
                return;
              }
              const calendar = useCalendarLists
                .getState()
                .calendars.find((entry) => entry.id === calendarId);
              if (calendar)
                await publishCalendarList(calendar, {
                  onRelayComplete: callbacks.onRelayComplete,
                });
            },
          },
          {
            id: "send-approval",
            labelId: "booking.step.sendApproval",
            relays,
            blocking: true,
            run: async (callbacks) => {
              if (!responseStepStarted) {
                responseStepStarted = true;
                return;
              }
              if (approvalResult)
                await publishSignedEvent(approvalResult.responseGiftWrap, {
                  onRelayComplete: callbacks.onRelayComplete,
                });
            },
          },
        ];
        await usePublishActivityStore.getState().runFlow(approvalFlowId, steps);
      } else await declineRequest(item.value.id, reason || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update booking.");
    } finally {
      setWorking(false);
    }
  };
  const retryApprovalStep = async (stepId: string) => {
    setRetryingStepId(stepId);
    try {
      await usePublishActivityStore
        .getState()
        .retryStep(approvalFlowId, stepId);
    } finally {
      setRetryingStepId(null);
    }
  };
  return (
    <Paper
      variant={embedded ? "elevation" : "outlined"}
      elevation={0}
      sx={{
        p: embedded ? { xs: 1.5, sm: 3 } : 3,
        minWidth: 0,
        overflow: "hidden",
        minHeight: embedded ? 0 : 460,
      }}
    >
      <Stack
        direction={embedded ? { xs: "column", sm: "row" } : "row"}
        justifyContent="space-between"
        alignItems={embedded ? { xs: "flex-start", sm: "center" } : "center"}
        gap={2}
      >
        <Box display="flex" gap={1.5} minWidth={0}>
          {loading ? (
            <Skeleton variant="circular" width={48} height={48} />
          ) : (
            <Avatar src={participant.picture} sx={{ width: 48, height: 48 }}>
              {participant.name?.[0] ?? "?"}
            </Avatar>
          )}
          <Box minWidth={0}>
            <Stack direction="row" alignItems="center" gap={0.5}>
              <Typography variant="h6">
                {participant.name || requester(item).slice(0, 16) + "…"}
              </Typography>
              {verified && (
                <VerifiedIcon
                  color="primary"
                  fontSize="small"
                  titleAccess="Verified NIP-05"
                />
              )}
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ overflowWrap: "anywhere" }}
            >
              {requester(item).slice(0, 16)}…{requester(item).slice(-8)}
            </Typography>
            {verified && (
              <Typography
                variant="caption"
                display="block"
                color="text.secondary"
              >
                {participant.nip05}
              </Typography>
            )}
          </Box>
        </Box>
        <Chip label={item.value.status} color={colors[item.value.status]} />
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Typography variant="h6">{label(item)}</Typography>
      <Typography sx={{ mt: 0.5 }}>
        {dayjs(item.value.start).format("dddd, MMMM D, YYYY · h:mm A")} –{" "}
        {dayjs(item.value.end).format("h:mm A")}
      </Typography>
      {page && (
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Times are shown in {page.timezone}. {page.title}
        </Typography>
      )}
      {conflict && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          This time overlaps with an item in your busy list.
        </Alert>
      )}
      {item.value.note && (
        <Typography color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
          “{item.value.note}”
        </Typography>
      )}
      {incoming && page?.formAttachments?.length ? (
        <Box mt={2}>
          <Typography variant="subtitle2" mb={1}>
            Intake form
          </Typography>
          <Stack spacing={0.75}>
            {page.formAttachments.map((a) => (
              <FormAttachmentRow
                key={a.naddr}
                attachment={a}
                eventAuthor={page.user}
                checkPubkey={item.value.bookerPubkey}
                showSubmissionStatus
              />
            ))}
          </Stack>
        </Box>
      ) : null}
      {incoming && item.value.status === "pending" && (
        <Stack spacing={1.5} mt={3}>
          <CalendarListSelect
            value={calendarId}
            onChange={setCalendarId}
            label="Add to calendar"
          />
          {calendarsLoaded && !calendars.length && (
            <Alert severity="warning">
              Create a calendar before approving.
            </Alert>
          )}
          <TextField
            size="small"
            label="Decline reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="contained"
              disabled={working || !calendarId}
              onClick={() => void act("approve")}
            >
              Approve
            </Button>
            <Button
              color="error"
              variant="outlined"
              disabled={working}
              onClick={() => void act("decline")}
            >
              Decline
            </Button>
          </Stack>
        </Stack>
      )}
      {resolved && (
        <Box mt={3}>
          <Button
            size="small"
            color="inherit"
            startIcon={<ArchiveOutlinedIcon />}
            onClick={() =>
              incoming
                ? dismissIncomingRequest(item.value.id)
                : dismissOutgoingBooking(item.value.id)
            }
          >
            Archive
          </Button>
        </Box>
      )}
      {approvalSteps.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <PublishActivityPanel
            steps={approvalSteps}
            onDetailsClick={
              approvalSteps.some((step) => step.status === "error")
                ? () => setDetailsOpen(true)
                : undefined
            }
            detailsLabel={intl.formatMessage({ id: "event.relayDetails" })}
          />
          <PublishActivityDialog
            open={detailsOpen}
            steps={approvalSteps}
            onClose={() => setDetailsOpen(false)}
            onRetryStep={retryApprovalStep}
            retryingStepId={retryingStepId}
          />
        </Box>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}
