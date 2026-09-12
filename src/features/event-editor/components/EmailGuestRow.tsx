import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { Box, Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { mailTokens, radius, spacing } from "../../../theme/tokens";

const Row = styled("li")(({ theme }) => {
  const mode =
    theme.palette.mode === "dark" ? mailTokens.dark : mailTokens.light;
  return {
    display: "flex",
    alignItems: "center",
    gap: spacing * 1.25,
    padding: `${spacing}px ${spacing * 1.5}px`,
    borderRadius: radius.card,
    border: `1px solid ${mode.border}`,
    backgroundColor: mode.surface,
    minWidth: 0,
  };
});

const Tile = styled("span")(({ theme }) => {
  const mode =
    theme.palette.mode === "dark" ? mailTokens.dark : mailTokens.light;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacing * 4,
    height: spacing * 4,
    flexShrink: 0,
    borderRadius: radius.sm + 2,
    backgroundColor: mode.tile,
    color: mode.text,
  };
});

const Tag = styled("span")(({ theme }) => {
  const mode =
    theme.palette.mode === "dark" ? mailTokens.dark : mailTokens.light;
  return {
    flexShrink: 0,
    padding: `${spacing / 4}px ${spacing}px`,
    borderRadius: radius.pill,
    backgroundColor: mode.tag,
    color: mode.text,
    ...theme.typography.caption,
    fontWeight: 600,
  };
});

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
