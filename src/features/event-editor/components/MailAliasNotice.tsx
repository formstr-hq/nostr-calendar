import { Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { MAIL_LANDING_URL } from "../../../nostr/mailBridge";
import { mailTokens, radius, spacing } from "../../../theme/tokens";

const Notice = styled("div")(({ theme }) => {
  const mode =
    theme.palette.mode === "dark" ? mailTokens.dark : mailTokens.light;
  return {
    display: "flex",
    flexDirection: "column",
    gap: spacing,
    padding: spacing * 1.5,
    borderRadius: radius.card,
    border: `1px solid ${mode.noticeBorder}`,
    backgroundColor: mode.noticeSurface,
  };
});

const Title = styled(Typography)(({ theme }) => {
  const mode =
    theme.palette.mode === "dark" ? mailTokens.dark : mailTokens.light;
  return {
    ...theme.typography.body2,
    fontWeight: 700,
    color: mode.noticeText,
  };
});

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
