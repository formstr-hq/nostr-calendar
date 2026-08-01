import { Avatar, MenuItem, Tooltip, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { nip19 } from "nostr-tools";
import type { ParticipantSearchResult } from "../features/event-editor/hooks/useParticipantSearch";
import { spacing } from "../theme/tokens";

const ResultRow = styled(MenuItem)({
  minHeight: spacing * 7,
  gap: spacing * 1.5,
  padding: `${spacing}px ${spacing * 1.5}px`,
});

const ResultAvatar = styled(Avatar, {
  shouldForwardProp: (prop) => prop !== "$known",
})<{ $known: boolean }>(({ theme, $known }) => ({
  width: spacing * 4,
  height: spacing * 4,
  boxSizing: "border-box",
  border: `1.5px solid ${
    $known
      ? (theme.vars?.palette.text.primary ?? theme.palette.text.primary)
      : "transparent"
  }`,
}));

const Identity = styled(Typography)({
  flexShrink: 0,
  maxWidth: spacing * 18,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const shortNpub = (pubkey: string) => {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 7)}....${npub.slice(-3)}`;
};

interface ParticipantSearchOptionProps {
  option: ParticipantSearchResult;
  listboxId: string;
  selected: boolean;
  onActivate: () => void;
  onSelect: () => void;
}

export function ParticipantSearchOption({
  option,
  listboxId,
  selected,
  onActivate,
  onSelect,
}: ParticipantSearchOptionProps) {
  const intl = useIntl();
  const name = option.displayName ?? option.name;
  const npub = shortNpub(option.pubkey);
  const previouslyMet = intl.formatMessage({
    id: "participant.previouslyMet",
  });

  return (
    <Tooltip title={option.isPreviouslyMet ? previouslyMet : ""} describeChild>
      <ResultRow
        id={`${listboxId}-${option.pubkey}`}
        role="option"
        selected={selected}
        aria-selected={selected}
        onMouseEnter={onActivate}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSelect}
      >
        <ResultAvatar src={option.picture} $known={option.isPreviouslyMet}>
          {(name ?? npub).slice(0, 1).toUpperCase()}
        </ResultAvatar>
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ flex: 1, minWidth: 0 }}
        >
          {name ?? npub}
        </Typography>
        <Identity variant="caption" color="text.secondary">
          {option.isNip05Verified && option.nip05 ? option.nip05 : npub}
        </Identity>
      </ResultRow>
    </Tooltip>
  );
}
