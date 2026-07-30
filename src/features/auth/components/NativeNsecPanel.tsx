import { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { signerManager } from "../../../common/signer";
import { useIntl } from "react-intl";

export function NativeNsecPanel({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const intl = useIntl();
  const [nsec, setNsec] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = async () => {
    setLoading(true);
    onError("");
    try {
      await signerManager.loginWithNsec(nsec.trim());
      onSuccess();
    } catch (error) {
      onError(
        error instanceof Error && error.message === "Invalid nsec"
          ? intl.formatMessage({ id: "login.invalidNsec" })
          : intl.formatMessage({ id: "login.loginFailed" }),
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <Box
      sx={{ px: { xs: 2.5, sm: 4 }, pb: 3, pt: 0.5, bgcolor: "action.hover" }}
    >
      <Stack spacing={1.5}>
        <TextField
          placeholder={intl.formatMessage({ id: "login.enterNsecPlaceholder" })}
          value={nsec}
          onChange={(event) => setNsec(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void login();
          }}
          type={visible ? "text" : "password"}
          autoComplete="off"
          fullWidth
          slotProps={{
            htmlInput: {
              "data-testid": "login-input-nsec",
              "aria-label": "nsec input",
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
            },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={() => setVisible((value) => !value)}
                    aria-label={intl.formatMessage({
                      id: visible ? "login.hideNsec" : "login.showNsec",
                    })}
                  >
                    {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => void login()}
          disabled={loading || !nsec.trim()}
          data-testid="login-submit-nsec"
          aria-label={intl.formatMessage({ id: "navigation.login" })}
        >
          {loading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            intl.formatMessage({ id: "navigation.login" })
          )}
        </Button>
      </Stack>
    </Box>
  );
}
