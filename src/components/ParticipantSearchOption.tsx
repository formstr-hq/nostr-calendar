import ContactsOutlinedIcon from "@mui/icons-material/ContactsOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import { Avatar, MenuItem, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { nip19 } from "nostr-tools";
import type { ParticipantSearchResult } from "../features/event-editor/hooks/useParticipantSearch";
import { spacing } from "../theme/tokens";

const ResultRow = styled(MenuItem)({
  minHeight: spacing * 7,
  gap: spacing * 1.5,
  padding: `${spacing}px ${spacing * 1.5}px`,
}) as typeof MenuItem;

const ResultAvatar = styled(Avatar)({
  width: spacing * 4,
  height: spacing * 4,
});

const ProfileGraphic = styled("span")({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  gap: spacing / 2,
});

const SourceIcons = styled("span")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: spacing / 4,
  color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
  "& .MuiSvgIcon-root": {
    fontSize: spacing * 2,
  },
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

  return (
    <ResultRow
      component="div"
      id={`${listboxId}-${option.pubkey}`}
      role="option"
      disabled={option.isSelected}
      selected={selected}
      aria-selected={selected}
      onMouseEnter={onActivate}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <ProfileGraphic>
        <ResultAvatar src={option.picture}>
          {(name ?? npub).slice(0, 1).toUpperCase()}
        </ResultAvatar>
        {(option.isPreviouslyMet || option.isContact) && (
          <SourceIcons>
            {option.isPreviouslyMet && (
              <EventOutlinedIcon
                role="img"
                aria-label={intl.formatMessage({
                  id: "participant.sharedEvent",
                })}
                data-testid="participant-event-icon"
              />
            )}
            {option.isContact && (
              <ContactsOutlinedIcon
                role="img"
                aria-label={intl.formatMessage({
                  id: "participant.inContacts",
                })}
                data-testid="participant-contact-icon"
              />
            )}
          </SourceIcons>
        )}
      </ProfileGraphic>
      <Typography
        variant="body2"
        fontWeight={600}
        noWrap
        sx={{ flex: 1, minWidth: 0 }}
      >
        {name ?? npub}
      </Typography>
      <Identity variant="caption" color="text.secondary">
        {option.isSelected
          ? intl.formatMessage({ id: "participant.alreadyInEvent" })
          : option.isNip05Verified && option.nip05
            ? option.nip05
            : npub}
      </Identity>
    </ResultRow>
  );
}
