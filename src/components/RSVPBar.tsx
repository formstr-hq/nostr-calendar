/**
 * RSVPBar
 *
 * The automatic-RSVP questionnaire for a calendar event. Renders three
 * status buttons (Yes / Maybe / No) and an optional details panel for
 * suggesting an alternate time and leaving a comment.
 *
 * The component is a thin presentational shell over the `useEventRsvps`
 * hook — the hook owns the relay subscription, optimistic state, and
 * publish path.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../utils/types";
import { RSVPStatus } from "../utils/types";
import { useEventRsvps } from "../hooks/useEventRsvps";
import { useUser } from "../stores/user";

interface RSVPBarProps {
  event: ICalendarEvent;
}

const toLocalInput = (unixSec: number | undefined, fallbackMs: number) => {
  const ms = unixSec ? unixSec * 1000 : fallbackMs;
  return dayjs(ms).format("YYYY-MM-DDTHH:mm");
};

export function RSVPBar({ event }: RSVPBarProps) {
  const intl = useIntl();
  const { user } = useUser();
  const { myRsvp, isSubmitting, submit } = useEventRsvps(event);

  const [expanded, setExpanded] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [comment, setComment] = useState("");

  // Hydrate the details fields from any existing RSVP, falling back to
  // the event's actual start/end so users always see a sensible default.
  useEffect(() => {
    setStart(toLocalInput(myRsvp?.suggestedStart, event.begin));
    setEnd(toLocalInput(myRsvp?.suggestedEnd, event.end));
    setComment(myRsvp?.comment ?? "");
  }, [myRsvp, event.begin, event.end]);

  const currentStatus: RSVPStatus = myRsvp?.status ?? RSVPStatus.pending;

  const handleStatus = async (status: RSVPStatus) => {
    if (!user) return;
    const startSec = start
      ? Math.floor(dayjs(start).valueOf() / 1000)
      : undefined;
    const endSec = end ? Math.floor(dayjs(end).valueOf() / 1000) : undefined;
    await submit({
      status,
      // Only include suggested times if the user actually changed them
      // away from the event's own times — avoids spurious "suggestions".
      suggestedStart:
        startSec && startSec !== Math.floor(event.begin / 1000)
          ? startSec
          : undefined,
      suggestedEnd:
        endSec && endSec !== Math.floor(event.end / 1000) ? endSec : undefined,
      comment: comment.trim() || undefined,
    });
  };

  const buttonLabel = useMemo(
    () => ({
      [RSVPStatus.accepted]: intl.formatMessage({ id: "rsvp.yes" }),
      [RSVPStatus.tentative]: intl.formatMessage({ id: "rsvp.maybe" }),
      [RSVPStatus.declined]: intl.formatMessage({ id: "rsvp.no" }),
      [RSVPStatus.pending]: "",
    }),
    [intl],
  );

  if (!user) return null;

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Typography variant="subtitle2">
          {intl.formatMessage({ id: "rsvp.yourResponse" })}
        </Typography>
        <ButtonGroup size="small" disabled={isSubmitting}>
          <Button
            variant={
              currentStatus === RSVPStatus.accepted ? "contained" : "outlined"
            }
            color="success"
            onClick={() => handleStatus(RSVPStatus.accepted)}
          >
            {buttonLabel[RSVPStatus.accepted]}
          </Button>
          <Button
            variant={
              currentStatus === RSVPStatus.tentative ? "contained" : "outlined"
            }
            color="warning"
            onClick={() => handleStatus(RSVPStatus.tentative)}
          >
            {buttonLabel[RSVPStatus.tentative]}
          </Button>
          <Button
            variant={
              currentStatus === RSVPStatus.declined ? "contained" : "outlined"
            }
            color="error"
            onClick={() => handleStatus(RSVPStatus.declined)}
          >
            {buttonLabel[RSVPStatus.declined]}
          </Button>
        </ButtonGroup>
        <IconButton
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-label={intl.formatMessage({ id: "rsvp.toggleDetails" })}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Stack spacing={1.5} mt={1.5}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <TextField
              label={intl.formatMessage({ id: "rsvp.suggestedStart" })}
              type="datetime-local"
              size="small"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={intl.formatMessage({ id: "rsvp.suggestedEnd" })}
              type="datetime-local"
              size="small"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <TextField
            label={intl.formatMessage({ id: "rsvp.comment" })}
            multiline
            minRows={2}
            size="small"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            {intl.formatMessage({ id: "rsvp.detailsHint" })}
          </Typography>
        </Stack>
      </Collapse>
    </Box>
  );
}
