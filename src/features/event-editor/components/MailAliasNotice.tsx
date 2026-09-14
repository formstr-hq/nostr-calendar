import { Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { MAIL_LANDING_URL } from "../../../nostr/mailBridge";
import { radius, spacing } from "../../../theme/tokens";
import { mailModeStyles } from "../../../theme/mailStyles";

const Notice = styled("div")(({ theme }) =>
  mailModeStyles(theme, (tokens) => ({
    display: "flex",
    flexDirection: "column",
    gap: spacing,
    padding: spacing * 1.5,
    borderRadius: radius.card,
    border: `1px solid ${tokens.noticeBorder}`,
    backgroundColor: tokens.noticeSurface,
  })),
);

const Title = styled(Typography)(({ theme }) => [
  { ...theme.typography.body2, fontWeight: 700 },
  ...mailModeStyles(theme, (tokens) => ({ color: tokens.noticeText })),
]);

/**
 * Gated state: an email guest exists but the organizer has no known mail
 * address. The From must be an alias the signed-in npub owns — the bridge
 * authorizes on the seal's key, so a typed address without a backing NIP-05
 * record would be rejected. Claiming one is the only path. (wireframe 03/06)
 */
export function MailAliasNotice() {
  const intl = useIntl();

  return (
    <Notice data-testid="mail-alias-notice">
      <Title>{intl.formatMessage({ id: "emailGuest.noAliasTitle" })}</Title>
      <Typography variant="caption" color="text.secondary">
        {intl.formatMessage({ id: "emailGuest.noAliasBody" })}
      </Typography>
      <Button
        variant="contained"
        size="small"
        href={MAIL_LANDING_URL}
        target="_blank"
        rel="noreferrer"
        sx={{ alignSelf: "flex-start", textTransform: "none" }}
      >
        {intl.formatMessage({ id: "emailGuest.getAddress" })}
      </Button>
    </Notice>
  );
}
