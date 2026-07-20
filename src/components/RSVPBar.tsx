/**
 * RSVPBar
 *
 * The automatic-RSVP questionnaire for a calendar event. Renders three
 * status buttons (Yes / Maybe / No). Alternate-time suggestions and notes
 * are handled by the SuggestedTime and AddNote sub-components.
 *
 * The component is a controlled RSVP editor. The parent owns the RSVP
 * fetch/submission lifecycle and passes the current record plus a submit
 * callback so page-level flows can reuse the same UI before and after an
 * event is added to a calendar.
 */

import { useEffect, useMemo, useState } from "react";
import { Button, ButtonGroup, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../utils/types";
import { RSVPStatus } from "../utils/types";
import type { RSVPPayload, RSVPRecord } from "../nostr/rsvp";
import { SuggestedTime } from "./SuggestedTime";
import { AddNote } from "./AddNote";

interface RSVPBarProps {
  event: ICalendarEvent;
  myRsvp?: RSVPRecord;
  isSubmitting: boolean;
  isAuthor: boolean;
  onSubmit: (payload: RSVPPayload) => Promise<void>;
}

const toLocalInput = (unixSec: number | undefined, fallbackMs: number) => {
  const ms = unixSec ? unixSec * 1000 : fallbackMs;
  return dayjs(ms).format("YYYY-MM-DDTHH:mm");
};

export function RSVPBar({
  event,
  myRsvp,
  isSubmitting,
  onSubmit,
  isAuthor,
}: RSVPBarProps) {
  const intl = useIntl();

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

  const activeStatus = currentStatus;

  const buildPayload = (status: RSVPStatus): RSVPPayload => {
    const startSec = start
      ? Math.floor(dayjs(start).valueOf() / 1000)
      : undefined;
    const endSec = end ? Math.floor(dayjs(end).valueOf() / 1000) : undefined;

    return {
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
    };
  };

  const submitStatus = async (status: RSVPStatus) => {
    await onSubmit(buildPayload(status));
  };

  const handleStatus = async (status: RSVPStatus) => {
    await submitStatus(status);
  };

  const handleDetailsSubmit = async () => {
    const status =
      activeStatus === RSVPStatus.pending ? RSVPStatus.tentative : activeStatus;
    await submitStatus(status);
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

  return (
    <Stack spacing={1.75}>
      <Stack spacing={1}>
        <Typography variant="subtitle2">
          {intl.formatMessage({ id: "rsvp.yourResponse" })}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
          <ButtonGroup size="small" disabled={isSubmitting}>
            <Button
              variant={
                activeStatus === RSVPStatus.accepted ? "contained" : "outlined"
              }
              color="success"
              data-testid="rsvp-yes"
              onClick={() => handleStatus(RSVPStatus.accepted)}
            >
              {buttonLabel[RSVPStatus.accepted]}
            </Button>
            <Button
              variant={
                activeStatus === RSVPStatus.tentative ? "contained" : "outlined"
              }
              color="warning"
              data-testid="rsvp-maybe"
              onClick={() => handleStatus(RSVPStatus.tentative)}
            >
              {buttonLabel[RSVPStatus.tentative]}
            </Button>
            <Button
              variant={
                activeStatus === RSVPStatus.declined ? "contained" : "outlined"
              }
              color="error"
              data-testid="rsvp-no"
              onClick={() => handleStatus(RSVPStatus.declined)}
            >
              {buttonLabel[RSVPStatus.declined]}
            </Button>
          </ButtonGroup>
        </Stack>
      </Stack>

      {!isAuthor && (
        <SuggestedTime
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
          onSave={() => {
            void handleDetailsSubmit();
          }}
          isSubmitting={isSubmitting}
        />
      )}

      <AddNote
        comment={comment}
        onCommentChange={setComment}
        onSave={() => {
          void handleDetailsSubmit();
        }}
        isSubmitting={isSubmitting}
      />
    </Stack>
  );
}
