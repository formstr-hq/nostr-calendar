import { Box, Button } from "@mui/material";
import { useIntl } from "react-intl";
import { ParticipantAdd } from "./ParticipantAdd";
import { Participant } from "./Participant";
import { uniqueParticipants } from "../utils/participants";

interface EventParticipantsProps {
  participants: string[];
  authorPubkey: string;
  onChange: (participants: string[]) => void;
}

export function EventParticipants({
  participants,
  authorPubkey,
  onChange,
}: EventParticipantsProps) {
  const intl = useIntl();
  const displayParticipants = uniqueParticipants(participants);

  return (
    <Box style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <ParticipantAdd
        participants={participants}
        onAdd={(pubKey) => {
          onChange(uniqueParticipants([...participants, pubKey]));
        }}
      />

      {displayParticipants.length > 0 && (
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
        </Box>
      )}
    </Box>
  );
}
