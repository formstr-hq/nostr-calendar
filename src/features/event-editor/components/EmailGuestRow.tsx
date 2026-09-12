import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { Box, Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { radius, spacing } from "../../../theme/tokens";
import { mailModeStyles } from "../../../theme/mailStyles";

const Row = styled("li")(({ theme }) =>
  mailModeStyles(theme, (tokens) => ({
    display: "flex",
    alignItems: "center",
    gap: spacing * 1.25,
    padding: `${spacing}px ${spacing * 1.5}px`,
    borderRadius: radius.card,
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surface,
    minWidth: 0,
  })),
);

const Tile = styled("span")(({ theme }) =>
  mailModeStyles(theme, (tokens) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacing * 4,
    height: spacing * 4,
    flexShrink: 0,
    borderRadius: radius.sm + 2,
    backgroundColor: tokens.tile,
    color: tokens.text,
  })),
);

const Tag = styled("span")(({ theme }) => [
  {
    flexShrink: 0,
    padding: `${spacing / 4}px ${spacing}px`,
    borderRadius: radius.pill,
    fontWeight: 600,
    ...theme.typography.caption,
  },
  ...mailModeStyles(theme, (tokens) => ({
    backgroundColor: tokens.tag,
    color: tokens.text,
  })),
]);

const Address = styled(Typography)({
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}) as typeof Typography;

/**
 * One email guest in the guest list. Visually distinct from Nostr guests so
 * organizers can tell delivery paths apart at a glance (wireframe 02/05).
 */
export function EmailGuestRow({
  email,
  onRemove,
}: {
  email: string;
  onRemove: () => void;
}) {
  const intl = useIntl();
  return (
    <Row data-testid="email-guest-row">
      <Tile>
        <MailOutlineIcon fontSize="small" />
      </Tile>
      <Box
        sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}
      >
        <Address variant="body2" title={email}>
          {email}
        </Address>
        <Typography variant="caption" color="text.secondary">
          {intl.formatMessage({ id: "emailGuest.invitedByEmail" })}
        </Typography>
      </Box>
      <Tag>{intl.formatMessage({ id: "emailGuest.viaEmail" })}</Tag>
      <Button size="small" color="error" onClick={onRemove}>
        {intl.formatMessage({ id: "navigation.remove" })}
      </Button>
    </Row>
  );
}
