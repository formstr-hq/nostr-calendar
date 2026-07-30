import { useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { signerManager } from "../../../common/signer";
import { readNcryptsecFile } from "../lib/keyFile";
import { useIntl } from "react-intl";

export function NcryptsecPanel({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const intl = useIntl();
  const [ncryptsec, setNcryptsec] = useState(
    () => signerManager.getStoredNcryptsec() ?? "",
  );
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      setNcryptsec(await readNcryptsecFile(file));
      onError("");
    } catch (error) {
      onError(
        error instanceof Error
          ? intl.formatMessage({ id: `login.${error.message}` })
          : intl.formatMessage({ id: "login.keyFileReadFailed" }),
      );
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    onError("");
    try {
      await signerManager.loginWithNcryptsec(ncryptsec.trim(), passphrase);
      onSuccess();
    } catch {
      onError(intl.formatMessage({ id: "login.invalidNcryptsec" }));
    } finally {
      setLoading(false);
      setPassphrase("");
    }
  };

  return (
    <Box
      sx={{ px: { xs: 2.5, sm: 4 }, pb: 3, pt: 0.5, bgcolor: "action.hover" }}
    >
      <Stack spacing={1.5}>
        <TextField
          label="ncryptsec"
          placeholder={intl.formatMessage({ id: "login.ncryptsecPlaceholder" })}
          value={ncryptsec}
          onChange={(event) => setNcryptsec(event.target.value)}
          multiline
          minRows={2}
          fullWidth
          slotProps={{
            htmlInput: {
              "data-testid": "login-input-ncryptsec",
              autoCapitalize: "none",
              spellCheck: false,
            },
          }}
        />
        {!ncryptsec && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              data-testid="login-upload-key-input"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => fileInputRef.current?.click()}
              data-testid="login-upload-key"
            >
              {intl.formatMessage({ id: "login.uploadKey" })}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({ id: "login.uploadKeyHint" })}
            </Typography>
          </>
        )}
        <TextField
          label={intl.formatMessage({ id: "login.passphrase" })}
          type={showPassphrase ? "text" : "password"}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleLogin();
          }}
          autoComplete="current-password"
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={() => setShowPassphrase((visible) => !visible)}
                    aria-label={intl.formatMessage({
                      id: showPassphrase
                        ? "login.hidePassphrase"
                        : "login.showPassphrase",
                    })}
                  >
                    {showPassphrase ? (
                      <VisibilityOffIcon />
                    ) : (
                      <VisibilityIcon />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => void handleLogin()}
          disabled={loading || !ncryptsec.trim() || !passphrase}
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
