import { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CommentIcon from "@mui/icons-material/Comment";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { RSVPStatus, type ICalendarEvent } from "../utils/types";
import type { RSVPRecord } from "../common/nostr";
import { Participant } from "./Participant";

function getRSVPDetails(record: RSVPRecord | undefined, event: ICalendarEvent) {
  if (!record) {
    return {
      hasComment: false,
      hasSuggestedTime: false,
    };
  }

  const eventStartSec = Math.floor(event.begin / 1000);
  const eventEndSec = Math.floor(event.end / 1000);
  const hasSuggestedStart =
    record.suggestedStart !== undefined &&
    record.suggestedStart !== eventStartSec;
  const hasSuggestedEnd =
    record.suggestedEnd !== undefined && record.suggestedEnd !== eventEndSec;

  return {
    hasComment: !!record.comment.trim(),
    hasSuggestedTime: hasSuggestedStart || hasSuggestedEnd,
    hasSuggestedStart,
    hasSuggestedEnd,
    eventStartSec,
    eventEndSec,
  };
}

export function RSVPParticipantList({
  event,
  participants,
  recordsByPubkey,
  canApplySuggestions = false,
  onApplySuggestion,
}: {
  event: ICalendarEvent;
  participants: string[];
  recordsByPubkey: Record<string, RSVPRecord>;
  canApplySuggestions?: boolean;
  onApplySuggestion?: (record: RSVPRecord) => Promise<void>;
}) {
  const intl = useIntl();
  const [expandedPubkey, setExpandedPubkey] = useState<string | null>(null);
  const [applyingPubkey, setApplyingPubkey] = useState<string | null>(null);

  const handleApplySuggestion = async (record: RSVPRecord) => {
    if (!onApplySuggestion) return;
    setApplyingPubkey(record.pubkey);
    try {
      await onApplySuggestion(record);
    } finally {
      setApplyingPubkey(null);
    }
  };

  return (
    <Stack direction="column" gap={0.75} width="100%">
      {participants.map((pubkey) => {
        const record = recordsByPubkey[pubkey];
        const details = getRSVPDetails(record, event);
        const hasDetails = details.hasComment || details.hasSuggestedTime;
        const expanded = expandedPubkey === pubkey;

        return (
          <Box key={pubkey} width="100%">
            <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
              <Participant
                pubKey={pubkey}
                isAuthor={pubkey === event.user}
                rsvpResponse={record?.status ?? RSVPStatus.pending}
              />
              {hasDetails ? (
                <Stack direction="row" gap={0.25}>
                  {details.hasSuggestedTime ? (
                    <Tooltip
                      title={intl.formatMessage({
                        id: "rsvp.suggestionsHeading",
                      })}
                    >
                      <IconButton
                        size="small"
                        aria-label="view suggested time"
                        onClick={() =>
                          setExpandedPubkey(expanded ? null : pubkey)
                        }
                        sx={{ p: 0.25 }}
                      >
                        <AccessTimeIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                  {details.hasComment ? (
                    <Tooltip title={intl.formatMessage({ id: "rsvp.comment" })}>
                      <IconButton
                        size="small"
                        aria-label="view comment"
                        onClick={() =>
                          setExpandedPubkey(expanded ? null : pubkey)
                        }
                        sx={{ p: 0.25 }}
                      >
                        <CommentIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </Stack>
              ) : null}
            </Box>
            <Collapse in={expanded && !!record} timeout="auto" unmountOnExit>
              <Stack spacing={0.5} mt={0.5} ml={4.5}>
                {details.hasSuggestedTime ? (
                  <Stack spacing={0.5} alignItems="flex-start">
                    <Typography variant="caption" color="text.secondary">
                      {details.hasSuggestedStart
                        ? `${intl.formatMessage({ id: "rsvp.suggestedStart" })}: ${dayjs(
                            (record?.suggestedStart ?? details.eventStartSec) *
                              1000,
                          ).format("ddd, DD MMM YYYY ⋅ HH:mm")}`
                        : null}
                      {details.hasSuggestedStart && details.hasSuggestedEnd
                        ? " · "
                        : ""}
                      {details.hasSuggestedEnd
                        ? `${intl.formatMessage({ id: "rsvp.suggestedEnd" })}: ${dayjs(
                            (record?.suggestedEnd ?? details.eventEndSec) *
                              1000,
                          ).format("ddd, DD MMM YYYY ⋅ HH:mm")}`
                        : null}
                    </Typography>
                    {canApplySuggestions && record ? (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={applyingPubkey === record.pubkey}
                        onClick={() => {
                          void handleApplySuggestion(record);
                        }}
                      >
                        {intl.formatMessage({ id: "rsvp.applySuggestion" })}
                      </Button>
                    ) : null}
                  </Stack>
                ) : null}
                {details.hasComment && record ? (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {record.comment}
                  </Typography>
                ) : null}
              </Stack>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
}
