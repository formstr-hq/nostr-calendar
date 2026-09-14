import { Box, Button } from "@mui/material";
import { useIntl } from "react-intl";
import { ParticipantAdd } from "./ParticipantAdd";
import { Participant } from "./Participant";
import { uniqueParticipants } from "../utils/participants";
import { EmailGuestRow } from "../features/event-editor/components/EmailGuestRow";
import { MailAliasPicker } from "../features/event-editor/components/MailAliasPicker";
import { MailAliasNotice } from "../features/event-editor/components/MailAliasNotice";
import { useMailIdentity } from "../stores/mailIdentity";

interface EventParticipantsProps {
  participants: string[];
  guestEmails?: string[];
  authorPubkey: string;
  onChange: (participants: string[]) => void;
  onGuestEmailsChange?: (guestEmails: string[]) => void;
}

export function EventParticipants({
  participants,
  guestEmails = [],
  authorPubkey,
  onChange,
  onGuestEmailsChange,
}: EventParticipantsProps) {
  const intl = useIntl();
  const displayParticipants = uniqueParticipants(participants);
  const alias = useMailIdentity((state) => state.alias);
  const aliasesLoaded = useMailIdentity((state) => state.aliasesLoaded);

  const addEmail = (email: string) => {
    if (!onGuestEmailsChange) return;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    onGuestEmailsChange(Array.from(new Set([...guestEmails, normalized])));
  };

  return (
    <Box
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      data-testid="event-participants"
    >
      <ParticipantAdd
        participants={participants}
        guestEmails={guestEmails}
        onAdd={(pubKey) => {
          onChange(uniqueParticipants([...participants, pubKey]));
        }}
        onAddEmail={onGuestEmailsChange ? addEmail : undefined}
      />

      {guestEmails.length > 0 && (
        <>
          {!alias && aliasesLoaded && <MailAliasNotice />}
          <MailAliasPicker />
        </>
      )}

      {(displayParticipants.length > 0 || guestEmails.length > 0) && (
        <Box
          component="ul"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {displayParticipants.map((participant) => (
            <Box
              component="li"
              key={participant}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.5,
                py: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              <Participant
                pubKey={participant}
                isAuthor={participant === authorPubkey}
              />
              <Button
                size="small"
                color="error"
                onClick={() => {
                  onChange(participants.filter((p) => p !== participant));
                }}
              >
                {intl.formatMessage({ id: "navigation.remove" })}
              </Button>
            </Box>
          ))}

          {guestEmails.map((email) => (
            <EmailGuestRow
              key={email}
              email={email}
              onRemove={() =>
                onGuestEmailsChange?.(
                  guestEmails.filter((value) => value !== email),
                )
              }
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
