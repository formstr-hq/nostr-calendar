import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { signerManager } from "../../../common/signer";
import { downloadNcryptsec } from "../lib/keyFile";
import { useIntl } from "react-intl";

export function CreateAccountFlow({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: () => void;
}) {
  const intl = useIntl();
  const [step, setStep] = useState<"form" | "backup">("form");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [about, setAbout] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [ncryptsec, setNcryptsec] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (passphrase !== confirm)
      return setError(
        intl.formatMessage({ id: "login.passphrasesDoNotMatch" }),
      );
    setLoading(true);
    setError("");
    try {
      const result = await signerManager.createAccount(passphrase, {
        name: name.trim() || undefined,
        picture: imageUrl.trim() || undefined,
        about: about.trim() || undefined,
      });
      setNcryptsec(result.ncryptsec);
      setPassphrase("");
      setConfirm("");
      setStep("backup");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : intl.formatMessage({ id: "login.createAccountFailed" }),
      );
    } finally {
      setLoading(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(ncryptsec);
    setCopied(true);
  };
  const download = () => {
    downloadNcryptsec(ncryptsec);
    setDownloaded(true);
  };

  if (step === "backup")
    return (
      <>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Box component="h2" sx={{ m: 0, fontSize: 20, fontWeight: 800 }}>
              {intl.formatMessage({ id: "login.backupKey" })}
            </Box>
            <Alert severity="warning">
              {intl.formatMessage({ id: "login.backupKeyWarning" })}
            </Alert>
            <Box
              sx={{
                bgcolor: "action.hover",
                borderRadius: 2,
                p: 1.5,
                wordBreak: "break-all",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.6,
                userSelect: "all",
              }}
            >
              {ncryptsec}
            </Box>
            <Button
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy()}
            >
              {copied
                ? intl.formatMessage({ id: "login.copied" })
                : intl.formatMessage({ id: "login.copyNcryptsec" })}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlinedIcon />}
            onClick={download}
            data-testid="login-download-key"
          >
            {intl.formatMessage({ id: "login.downloadKey" })}
          </Button>
          <Button
            variant="contained"
            onClick={onSuccess}
            disabled={!copied && !downloaded}
          >
            {intl.formatMessage({ id: "login.savedKey" })}
          </Button>
        </DialogActions>
      </>
    );

  return (
    <>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            label={intl.formatMessage({ id: "login.name" })}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            fullWidth
            autoFocus
          />
          <TextField
            label={intl.formatMessage({ id: "login.imageUrl" })}
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://…"
            fullWidth
            slotProps={{ htmlInput: { autoCapitalize: "none" } }}
          />
          <TextField
            label={intl.formatMessage({ id: "login.about" })}
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            minRows={2}
            multiline
            fullWidth
          />
          <TextField
            label={intl.formatMessage({ id: "login.passphrase" })}
            type={showPassphrase ? "text" : "password"}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            helperText={intl.formatMessage({ id: "login.encryptsKeyHint" })}
            autoComplete="new-password"
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      onClick={() => setShowPassphrase((visible) => !visible)}
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
          <TextField
            label={intl.formatMessage({ id: "login.confirmPassphrase" })}
            type={showPassphrase ? "text" : "password"}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
            }}
            autoComplete="new-password"
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onBack}>
          {intl.formatMessage({ id: "login.cancel" })}
        </Button>
        <Button
          variant="contained"
          onClick={() => void create()}
          disabled={loading || !passphrase || passphrase !== confirm}
        >
          {loading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            intl.formatMessage({ id: "login.create" })
          )}
        </Button>
      </DialogActions>
    </>
  );
}
