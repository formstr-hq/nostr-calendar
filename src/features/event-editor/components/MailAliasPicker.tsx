import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { Autocomplete, TextField, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useIntl } from "react-intl";
import { useEffect } from "react";
import { useMailIdentity } from "../../../stores/mailIdentity";
import { radius, spacing } from "../../../theme/tokens";
import { mailModeStyles } from "../../../theme/mailStyles";

const Card = styled("div")(({ theme }) =>
  mailModeStyles(theme, (tokens) => ({
    display: "flex",
    flexDirection: "column",
    gap: spacing * 1.25,
    padding: spacing * 1.5,
    borderRadius: radius.card,
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surface,
  })),
);

const Header = styled("div")({
  display: "flex",
  alignItems: "center",
  gap: spacing,
});

const Tile = styled("span")(({ theme }) =>
  mailModeStyles(theme, (tokens) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: spacing * 4.25,
    height: spacing * 4.25,
    flexShrink: 0,
    borderRadius: radius.sm + 2,
    backgroundColor: tokens.tile,
    color: tokens.text,
  })),
);

const Label = styled(Typography)(({ theme }) => [
  {
    ...theme.typography.caption,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  ...mailModeStyles(theme, (tokens) => ({ color: tokens.text })),
]);

/**
 * "Send email invites from" picker. Only rendered once an email guest exists.
 * The From must be an address the signing key owns (proof is the NIP-05
 * record at send time), so this offers known aliases plus free entry — it is
 * not a security control, just the composer for that value.
 */
export function MailAliasPicker() {
  const intl = useIntl();
  const { alias, aliases, setAlias, loadAliases } = useMailIdentity();

  useEffect(() => {
    void loadAliases();
  }, [loadAliases]);

  const options = Array.from(new Set([alias, ...aliases].filter(Boolean)));

  return (
    <Card data-testid="mail-alias-picker">
      <Header>
        <Tile>
          <MailOutlineIcon fontSize="small" />
        </Tile>
        <Label>{intl.formatMessage({ id: "emailGuest.sendFrom" })}</Label>
      </Header>
      <Autocomplete
        freeSolo
        size="small"
        options={options}
        value={alias}
        onChange={(_, value) => setAlias(value ?? "")}
        onInputChange={(_, value) => setAlias(value)}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={intl.formatMessage({
              id: "emailGuest.aliasPlaceholder",
            })}
            slotProps={{
              htmlInput: {
                ...params.inputProps,
                "data-testid": "mail-alias-input",
              },
            }}
          />
        )}
      />
      <Typography variant="caption" color="text.secondary">
        {intl.formatMessage({ id: "emailGuest.aliasHint" })}
      </Typography>
    </Card>
  );
}
