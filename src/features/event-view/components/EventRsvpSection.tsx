import { useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { ICalendarEvent, RSVPStatus } from "../../../utils/types";
import type { RSVPPayload, RSVPRecord } from "../../../nostr/rsvp";
import { AvatarStack } from "../../../components/ui/AvatarStack";
import { RSVPBar } from "./RSVPBar";
import { RSVPParticipantList } from "./RSVPParticipantList";

interface EventRsvpSectionProps {
  event: ICalendarEvent;
  isAuthor: boolean;
  /** RSVPBar (Yes/Maybe/No) only renders once the event is in a calendar. */
  showRsvpBar: boolean;
  byPubkey: Record<string, RSVPRecord>;
  allParticipants: string[];
  myRsvp?: RSVPRecord;
  isSubmitting: boolean;
  onSubmit: (payload: RSVPPayload) => Promise<void>;
  canApplySuggestions: boolean;
  onApplySuggestion: (record: RSVPRecord) => Promise<void>;
}

/**
 * Host/participant profile resolution (name, avatar) mounts a relay
 * subscription per pubkey (see Participant.tsx / useGetParticipant). To
 * avoid firing a burst of those on every event open — this view is also
 * reachable unauthenticated from the public standalone event page — the
 * summary row below shows only counts + initials-only avatars (no profile
 * fetch, same technique EventQuickPeek already uses), and the full
 * profile-resolving RSVPParticipantList only mounts once the user expands.
 */
export function EventRsvpSection({
  event,
  isAuthor,
  showRsvpBar,
  byPubkey,
  allParticipants,
  myRsvp,
  isSubmitting,
  onSubmit,
  canApplySuggestions,
  onApplySuggestion,
}: EventRsvpSectionProps) {
  const intl = useIntl();
  const [participantsExpanded, setParticipantsExpanded] = useState(false);

  const going = allParticipants.filter(
    (pk) => byPubkey[pk]?.status === RSVPStatus.accepted,
  ).length;
  const maybe = allParticipants.filter(
    (pk) => byPubkey[pk]?.status === RSVPStatus.tentative,
  ).length;
  const avatarItems = allParticipants
    .filter((pk) => byPubkey[pk]?.status === RSVPStatus.accepted)
    .map((pk) => ({ name: pk }));

  return (
    <Stack spacing={2}>
      {showRsvpBar && (
        <RSVPBar
          isAuthor={isAuthor}
          event={event}
          myRsvp={myRsvp}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      )}

      {allParticipants.length > 0 && (
        <Box>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            {avatarItems.length > 0 && (
              <AvatarStack items={avatarItems} size={28} max={4} />
            )}
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage(
                { id: "rsvp.goingSummary" },
                { going, maybe },
              )}
            </Typography>
            <Button
              size="small"
              onClick={() => setParticipantsExpanded((v) => !v)}
            >
              {intl.formatMessage({
                id: participantsExpanded
                  ? "rsvp.hideParticipants"
                  : "rsvp.showParticipants",
              })}
            </Button>
          </Box>
          {participantsExpanded && (
            <Box mt={1.5}>
              <Typography fontWeight={600} mb={0.75}>
                {intl.formatMessage({ id: "navigation.participants" })}
              </Typography>
              <RSVPParticipantList
                event={event}
                participants={allParticipants}
                recordsByPubkey={byPubkey}
                canApplySuggestions={canApplySuggestions}
                onApplySuggestion={onApplySuggestion}
              />
            </Box>
          )}
        </Box>
      )}
    </Stack>
  );
}
