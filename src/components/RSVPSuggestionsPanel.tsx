/**
 * RSVPSuggestionsPanel
 *
 * Editor-only surface that lists distinct alternate-time suggestions
 * carried in participant RSVPs. Each suggestion has an "Apply" action
 * that moves the calendar event to that time using the existing event
 * update flow.
 *
 * Suggestions whose start AND end exactly match the event's current
 * times are filtered out so we never re-display the status quo as a
 * "suggestion".
 */

import { useMemo, useState } from "react";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import { ICalendarEvent } from "../utils/types";
import { Participant } from "./Participant";
import { useTimeBasedEvents } from "../stores/events";
import { editPrivateCalendarEvent } from "../common/nostr";
import type { RSVPRecord } from "../common/nostr";

interface Suggestion {
  start: number; // unix seconds
  end?: number; // unix seconds
  responders: RSVPRecord[];
}

const groupSuggestions = (
  records: RSVPRecord[],
  event: ICalendarEvent,
): Suggestion[] => {
  const eventStartSec = Math.floor(event.begin / 1000);
  const eventEndSec = Math.floor(event.end / 1000);
  const grouped = new Map<string, Suggestion>();
  for (const r of records) {
    if (!r.suggestedStart) continue;
    if (
      r.suggestedStart === eventStartSec &&
      (!r.suggestedEnd || r.suggestedEnd === eventEndSec)
    ) {
      continue;
    }
    const key = `${r.suggestedStart}-${r.suggestedEnd ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.responders.push(r);
    } else {
      grouped.set(key, {
        start: r.suggestedStart,
        end: r.suggestedEnd,
        responders: [r],
      });
    }
  }
  return [...grouped.values()].sort((a, b) => a.start - b.start);
};

export function RSVPSuggestionsPanel({
  event,
  calendarId,
  records,
}: {
  event: ICalendarEvent;
  calendarId?: string;
  records: RSVPRecord[];
}) {
  const intl = useIntl();
  const { updateEvent } = useTimeBasedEvents();
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  const suggestions = useMemo(
    () => groupSuggestions(records, event),
    [records, event],
  );
  const canApplySuggestions = event.isPrivateEvent && !!calendarId;

  if (suggestions.length === 0) return null;

  const handleApply = async (s: Suggestion) => {
    const key = `${s.start}-${s.end ?? ""}`;
    setApplyingKey(key);
    try {
      const newBegin = s.start * 1000;
      const newEnd =
        (s.end ?? s.start + (event.end - event.begin) / 1000) * 1000;
      const updated: ICalendarEvent = {
        ...event,
        begin: newBegin,
        end: newEnd,
      };
      // Republish the private calendar event so all participants pick up
      // the new time on next decrypt; then sync local store.
      if (event.isPrivateEvent && calendarId) {
        await editPrivateCalendarEvent(updated, calendarId);
      }
      updateEvent(updated);
    } finally {
      setApplyingKey(null);
    }
  };

  return (
    <Box>
      <Divider sx={{ mb: 1 }} />
      <Typography variant="subtitle2" gutterBottom>
        {intl.formatMessage({ id: "rsvp.suggestionsHeading" })}
      </Typography>
      <Stack spacing={1}>
        {suggestions.map((s) => {
          const key = `${s.start}-${s.end ?? ""}`;
          return (
            <Box
              key={key}
              display="flex"
              alignItems="center"
              gap={1}
              flexWrap="wrap"
              sx={{
                p: 1,
                borderRadius: 1,
                border: (t) => `1px solid ${t.palette.divider}`,
              }}
            >
              <Box flex={1} minWidth={220}>
                <Typography variant="body2">
                  {dayjs(s.start * 1000).format("ddd, DD MMM YYYY ⋅ HH:mm")}
                  {s.end ? ` → ${dayjs(s.end * 1000).format("HH:mm")}` : ""}
                </Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" mt={0.5}>
                  {s.responders.map((r) => (
                    <Participant
                      key={r.pubkey}
                      pubKey={r.pubkey}
                      isAuthor={false}
                    />
                  ))}
                </Stack>
              </Box>
              {canApplySuggestions ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleApply(s)}
                  disabled={applyingKey === key}
                >
                  {intl.formatMessage({ id: "rsvp.applySuggestion" })}
                </Button>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
