import AddIcon from "@mui/icons-material/Add";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { MenuItem, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { spacing } from "../../../theme/tokens";

const Row = styled(MenuItem)({
  minHeight: spacing * 7,
  gap: spacing * 1.5,
  padding: `${spacing}px ${spacing * 1.5}px`,
}) as typeof MenuItem;

const Tile = styled("span")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: spacing * 4.25,
  height: spacing * 4.25,
  flexShrink: 0,
  borderRadius: spacing,
  backgroundColor:
    theme.vars?.palette.action.hover ?? theme.palette.action.hover,
  color: theme.vars?.palette.text.secondary ?? theme.palette.text.secondary,
}));

const AddBadge = styled("span")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: spacing * 3.5,
  height: spacing * 3.5,
  flexShrink: 0,
  borderRadius: "50%",
  backgroundColor:
    theme.vars?.palette.primary.main ?? theme.palette.primary.main,
  color:
    theme.vars?.palette.primary.contrastText ??
    theme.palette.primary.contrastText,
}));

interface EmailInviteRowProps {
  email: string;
  active: boolean;
  onActivate: () => void;
  onSelect: () => void;
}

/**
 * The "invite <email> by email" affordance shown in the guest box dropdown when
 * the query is a plain email with no Nostr match. Purely presentational — the
 * search/selection wiring lives in `ParticipantAdd`.
 */
export function EmailInviteRow({
  email,
  active,
  onActivate,
  onSelect,
}: EmailInviteRowProps) {
  const intl = useIntl();
  return (
    <Row
      component="div"
      role="option"
      selected={active}
      aria-selected={active}
      onMouseEnter={onActivate}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      data-testid="email-invite-option"
    >
      <Tile>
        <MailOutlineIcon fontSize="small" />
      </Tile>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap component="span">
          {intl.formatMessage({ id: "emailGuest.inviteByEmail" }, { email })}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          component="span"
          display="block"
        >
          {intl.formatMessage({ id: "emailGuest.deliveryHint" })}
        </Typography>
      </span>
      <AddBadge>
        <AddIcon sx={{ fontSize: spacing * 2 }} />
      </AddBadge>
    </Row>
  );
}
