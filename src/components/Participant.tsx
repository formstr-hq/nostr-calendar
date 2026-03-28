import { Skeleton, useTheme, Tooltip, IconButton, Theme } from "@mui/material";
import { useGetParticipant } from "../stores/participants";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { nip19 } from "nostr-tools";
import { RSVPResponse } from "../stores/events";
import { useState } from "react";
import { useIntl } from "react-intl";

interface ParticipantProps {
  pubKey: string;
  rsvpResponse?: RSVPResponse;
  isAuthor: boolean;
}

const getRSVPIcon = (response: RSVPResponse, theme: Theme) => {
  switch (response) {
    case RSVPResponse.accepted:
      return (
        <CheckCircleIcon
          style={{ color: theme.palette.success.main, fontSize: "16px" }}
        />
      );
    case RSVPResponse.declined:
      return (
        <CancelIcon
          style={{ color: theme.palette.error.main, fontSize: "16px" }}
        />
      );
    case RSVPResponse.tentative:
      return (
        <HelpIcon
          style={{ color: theme.palette.warning.main, fontSize: "16px" }}
        />
      );
    case RSVPResponse.pending:
      return (
        <ScheduleIcon
          style={{ color: theme.palette.text.secondary, fontSize: "16px" }}
        />
      );
    default:
      return null;
  }
};

const truncateText = (text: string, maxLength: number = 20) => {
  if (text.length <= maxLength) return text;

  // For npub, show first 8 and last 4 characters
  if (text.startsWith("npub")) {
    return `${text.slice(0, 8)}...${text.slice(-4)}`;
  }

  // For regular names, truncate with ellipsis
  return `${text.slice(0, maxLength)}...`;
};

export const Participant = ({
  pubKey,
  rsvpResponse,
  isAuthor,
}: ParticipantProps) => {
  const intl = useIntl();
  const theme = useTheme();
  const { participant, loading } = useGetParticipant({ pubKey });
  const npub = nip19.npubEncode(pubKey);
  const [copyTooltip, setCopyTooltip] = useState(
    intl.formatMessage({ id: "participant.clickToCopy" }),
  );

  const displayName = participant?.name || npub;
  const isLongText = displayName.length > 20;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(displayName);
      setCopyTooltip(intl.formatMessage({ id: "participant.copied" }));
      setTimeout(
        () =>
          setCopyTooltip(intl.formatMessage({ id: "participant.clickToCopy" })),
        2000,
      );
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!participant || !participant.publicKey) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <Skeleton variant="circular" width={"24px"} height={"24px"} />
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Skeleton width={100} height={20} />
          {rsvpResponse && getRSVPIcon(rsvpResponse, theme)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      {rsvpResponse && getRSVPIcon(rsvpResponse, theme)}
      <object
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "100%",
        }}
        data={participant.picture}
      >
        {loading ? (
          <Skeleton variant="circular" width={"24px"} height={"24px"} />
        ) : (
          <AccountCircleIcon />
        )}
      </object>
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span style={{ textDecoration: "underline" }}>
            {truncateText(displayName)}
          </span>
          {isAuthor && (
            <span style={{ color: theme.palette.text.secondary }}>
              ({intl.formatMessage({ id: "participant.author" })})
            </span>
          )}
          {isLongText && (
            <Tooltip title={copyTooltip} arrow>
              <IconButton
                size="small"
                onClick={handleCopy}
                style={{ padding: "2px" }}
              >
                <ContentCopyIcon style={{ fontSize: "14px" }} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};
