import { Skeleton, useTheme, Tooltip, IconButton, Theme } from "@mui/material";
import { useGetParticipant } from "../stores/participants";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { nip19 } from "nostr-tools";
import { RSVPStatus } from "../utils/types";
import { useState } from "react";
import { useIntl } from "react-intl";

interface ParticipantProps {
  pubKey: string;
  rsvpResponse?: RSVPStatus;
  isAuthor: boolean;
}

const getRSVPIcon = (response: RSVPStatus, theme: Theme) => {
  switch (response) {
    case RSVPStatus.accepted:
      return (
        <CheckCircleIcon
          style={{ color: theme.palette.success.main, fontSize: "16px" }}
        />
      );
    case RSVPStatus.declined:
      return (
        <CancelIcon
          style={{ color: theme.palette.error.main, fontSize: "16px" }}
        />
      );
    case RSVPStatus.tentative:
      return (
        <HelpIcon
          style={{ color: theme.palette.warning.main, fontSize: "16px" }}
        />
      );
    case RSVPStatus.pending:
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

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(npub);
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
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <Skeleton
          variant="circular"
          width={"24px"}
          height={"24px"}
          sx={{ flexShrink: 0 }}
        />
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flex: 1,
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
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {rsvpResponse && getRSVPIcon(rsvpResponse, theme)}
      <object
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "100%",
          flexShrink: 0,
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
          minWidth: 0,
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <div
          style={{
            overflow: "hidden",
            minWidth: 0,
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span
            style={{
              textDecoration: "underline",
              fontWeight: isAuthor ? 700 : undefined,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {truncateText(displayName)}
          </span>
          <Tooltip title={copyTooltip} arrow>
            <IconButton
              size="small"
              onClick={handleCopy}
              style={{ padding: "2px", flexShrink: 0 }}
            >
              <ContentCopyIcon style={{ fontSize: "14px" }} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
