import { CircularProgress, IconButton, TextField } from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useState } from "react";
import { useIntl } from "react-intl";
import { nip19 } from "nostr-tools";
import { NPub } from "nostr-tools/nip19";
import { NIP05_REGEX } from "nostr-tools/nip05";

const resolveNip05 = async (nip05: string): Promise<string | null> => {
  const match = nip05.match(NIP05_REGEX);
  if (!match) return null;

  const [, name = "_", domain] = match;

  try {
    const url = `https://${domain}/.well-known/nostr.json?name=${name}`;
    const res = await (await fetch(url, { redirect: "error" })).json();
    const pubkey = res.names?.[name];
    return typeof pubkey === "string" && pubkey.length === 64 ? pubkey : null;
  } catch {
    return null;
  }
};

export const ParticipantAdd = ({
  onAdd,
  participants = [],
}: {
  onAdd: (pubKey: string) => void;
  participants?: string[];
}) => {
  const [pubKey, updatePubkey] = useState("");
  const [errorMessageId, updateErrorMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canSubmit = !!pubKey && !loading;
  const intl = useIntl();
  const existingParticipants = new Set(
    participants.map((participant) => participant.toLowerCase()),
  );

  const addParticipant = (participant: string) => {
    const normalizedParticipant = participant.trim().toLowerCase();
    if (existingParticipants.has(normalizedParticipant)) {
      updateErrorMessageId("participant.alreadyAdded");
      return;
    }

    onAdd(normalizedParticipant);
    updatePubkey("");
  };

  const onSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    const trimmedPubKey = pubKey.trim();

    // npub
    if (trimmedPubKey.startsWith("npub")) {
      try {
        const decoded = nip19.decode(trimmedPubKey as NPub).data;
        if (typeof decoded !== "string") {
          updateErrorMessageId("participant.invalid");
          return;
        }
        addParticipant(decoded);
      } catch {
        updateErrorMessageId("participant.invalid");
      }
      return;
    }

    // NIP-05 (user@domain)
    if (NIP05_REGEX.test(trimmedPubKey)) {
      setLoading(true);
      const resolved = await resolveNip05(trimmedPubKey);
      setLoading(false);
      if (resolved) {
        addParticipant(resolved);
      } else {
        updateErrorMessageId("participant.invalid");
      }
      return;
    }

    // Hex pubkey
    if (/^[0-9a-fA-F]{64}$/.test(trimmedPubKey)) {
      addParticipant(trimmedPubKey);
      return;
    }

    updateErrorMessageId("participant.invalid");
  };

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <TextField
        size="small"
        error={!!errorMessageId}
        helperText={
          errorMessageId
            ? intl.formatMessage({ id: errorMessageId })
            : undefined
        }
        style={{
          width: "100%",
        }}
        placeholder={intl.formatMessage({ id: "navigation.addParticipants" })}
        value={pubKey}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSubmit();
          }
        }}
        onChange={(e) => {
          updateErrorMessageId(null);
          updatePubkey(e.target.value);
        }}
      />
      <IconButton
        style={{
          height: "100%",
        }}
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {loading ? <CircularProgress size={24} /> : <PersonAddIcon />}
      </IconButton>
    </div>
  );
};
