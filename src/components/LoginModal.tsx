import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { signerManager } from "../common/signer";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tabs,
  Tab,
  Stack,
  TextField,
  Typography,
  Alert,
  IconButton,
  Box,
  ButtonBase,
  Divider,
  InputAdornment,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PhonelinkLockOutlinedIcon from "@mui/icons-material/PhonelinkLockOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useIntl } from "react-intl";
import { isAndroidNative, isNative } from "../utils/platform";

const NIP46_RELAYS = ["wss://relay.nsec.app", "wss://nostr.oxtr.dev"];

// ─── Nip46Section ──────────────────────────────────────────────────────────────

const Nip46Section: React.FC<{
  onSuccess: () => void;
  onError: (msg: string) => void;
}> = ({ onSuccess, onError }) => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState("manual");
  const [bunkerUri, setBunkerUri] = useState("");
  const [relaysText, setRelaysText] = useState(NIP46_RELAYS.join("\n"));
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const qrAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      qrAbortRef.current?.abort();
    };
  }, []);

  const parseRelays = () =>
    relaysText
      .split(/[\n,]+/)
      .map((r) => r.trim())
      .filter(Boolean);

  const handleConnectManual = async () => {
    if (!bunkerUri) {
      onError(intl.formatMessage({ id: "login.enterBunkerUri" }));
      return;
    }
    setLoadingConnect(true);
    try {
      await signerManager.loginWithNip46(bunkerUri);
      onSuccess();
    } catch {
      onError(intl.formatMessage({ id: "login.connectionFailed" }));
    } finally {
      setLoadingConnect(false);
    }
  };

  const startQrLogin = (val: string) => {
    if (val !== "qr") {
      qrAbortRef.current?.abort();
      qrAbortRef.current = null;
      setQrUri(null);
      return;
    }
    const relays = parseRelays();
    if (relays.length === 0) {
      onError("At least one relay is required for QR login.");
      return;
    }
    setLoadingQr(true);
    setQrUri(null);
    const abort = new AbortController();
    qrAbortRef.current = abort;
    void signerManager
      .loginWithNostrConnectQR({
        relays,
        onUri: setQrUri,
        signal: abort.signal,
      })
      .then(() => {
        onSuccess();
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          onError(intl.formatMessage({ id: "login.connectionFailed" }));
        }
      })
      .finally(() => setLoadingQr(false));
  };

  return (
    <Box sx={{ px: 2, pb: 2, bgcolor: "action.hover" }}>
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={2}
        label="Relays (one per line)"
        value={relaysText}
        onChange={(e) => setRelaysText(e.target.value)}
        disabled={loadingConnect || loadingQr}
        sx={{ mt: 1.5, mb: 1 }}
        helperText="Relays used for the nostrconnect QR session"
      />

      <Tabs
        value={activeTab}
        onChange={(_e, val: string) => {
          setActiveTab(val);
          startQrLogin(val);
        }}
        sx={{ mb: 1 }}
      >
        <Tab
          label={intl.formatMessage({ id: "login.pasteUri" })}
          value="manual"
          disabled={loadingConnect || loadingQr}
        />
        <Tab
          label={intl.formatMessage({ id: "login.qrCode" })}
          value="qr"
          disabled={loadingConnect || loadingQr}
        />
      </Tabs>

      {activeTab === "manual" && (
        <Stack spacing={1} direction="row">
          <TextField
            size="small"
            fullWidth
            placeholder={intl.formatMessage({
              id: "login.enterBunkerUriPlaceholder",
            })}
            value={bunkerUri}
            onChange={(e) => setBunkerUri(e.target.value)}
            disabled={loadingConnect}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleConnectManual();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={() => void handleConnectManual()}
            disabled={loadingConnect || !bunkerUri}
            sx={{ flexShrink: 0, minWidth: 90 }}
          >
            {loadingConnect ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              intl.formatMessage({ id: "login.connect" })
            )}
          </Button>
        </Stack>
      )}

      {activeTab === "qr" && (
        <Box textAlign="center">
          {qrUri ? (
            <QRCodeCanvas value={qrUri} size={160} />
          ) : (
            <CircularProgress size={40} sx={{ my: 2 }} />
          )}
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            mt={1}
            gap={0.5}
          >
            {loadingQr ? (
              <>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">
                  {intl.formatMessage({ id: "login.waitingForConnection" })}
                </Typography>
              </>
            ) : (
              qrUri && (
                <>
                  <IconButton
                    size="small"
                    onClick={() => void navigator.clipboard.writeText(qrUri)}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption" color="text.secondary">
                    {intl.formatMessage({ id: "login.copyNostrconnectUri" })}
                  </Typography>
                </>
              )
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ─── Nip55Section ─────────────────────────────────────────────────────────────

function Nip55Section({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const intl = useIntl();
  const [installedSigners, setInstalledSigners] = useState<{
    apps: { packageName: string; name: string; iconUrl?: string }[];
  }>();
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { NostrSignerPlugin } = await import(
        "nostr-signer-capacitor-plugin"
      );
      const result = await NostrSignerPlugin.getInstalledSignerApps();
      setInstalledSigners(result);
    };
    void load();
  }, []);

  return (
    <>
      {installedSigners?.apps.map((app) => (
        <OptionButton
          key={app.packageName}
          icon={
            app.iconUrl ? (
              <img
                src={app.iconUrl}
                alt={app.name}
                style={{ width: 24, height: 24, borderRadius: 4 }}
              />
            ) : (
              <PhonelinkLockOutlinedIcon />
            )
          }
          title={app.name}
          description="Sign with external Android signer"
          loading={loadingPackage === app.packageName}
          disabled={loadingPackage !== null}
          onClick={() => {
            void (async () => {
              setLoadingPackage(app.packageName);
              try {
                await signerManager.loginWithNip55(app.packageName);
                onClose();
              } catch {
                onError(intl.formatMessage({ id: "login.couldNotLogin" }));
              } finally {
                setLoadingPackage(null);
              }
            })();
          }}
        />
      ))}
    </>
  );
}

// ─── NsecSection (Android native only) ────────────────────────────────────────

function NsecSection({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const intl = useIntl();
  const [nsec, setNsec] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNsec, setShowNsec] = useState(false);

  const handleNsecLogin = async () => {
    const trimmedNsec = nsec.trim();
    if (!trimmedNsec) {
      onError(intl.formatMessage({ id: "login.enterNsec" }));
      return;
    }

    setLoading(true);
    onError("");
    try {
      await signerManager.loginWithNsec(trimmedNsec);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Invalid nsec"
          ? intl.formatMessage({ id: "login.invalidNsec" })
          : intl.formatMessage({ id: "login.loginFailed" });
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ px: 2, pb: 2, bgcolor: "action.hover" }}>
      <Stack spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          placeholder={intl.formatMessage({
            id: "login.enterNsecPlaceholder",
          })}
          value={nsec}
          onChange={(e) => setNsec(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleNsecLogin();
            }
          }}
          type={showNsec ? "text" : "password"}
          autoComplete="off"
          slotProps={{
            htmlInput: { autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={() => setShowNsec((prev) => !prev)}
                    aria-label={intl.formatMessage({
                      id: showNsec ? "login.hideNsec" : "login.showNsec",
                    })}
                  >
                    {showNsec ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="contained"
          onClick={() => void handleNsecLogin()}
          disabled={loading || !nsec.trim()}
        >
          {intl.formatMessage({ id: "navigation.login" })}
        </Button>
      </Stack>
    </Box>
  );
}

// ─── NcryptsecSection (all platforms) ─────────────────────────────────────────

function NcryptsecSection({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [ncryptsec, setNcryptsec] = useState(
    () => signerManager.getStoredNcryptsec() ?? "",
  );
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    onError("");
    try {
      await signerManager.loginWithNcryptsec(ncryptsec.trim(), passphrase);
      onClose();
    } catch {
      onError("Invalid ncryptsec or wrong passphrase.");
    } finally {
      setLoading(false);
      setPassphrase("");
    }
  };

  return (
    <Box sx={{ px: 2, pb: 2, bgcolor: "action.hover" }}>
      <Stack spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          label="ncryptsec"
          placeholder="ncryptsec1..."
          value={ncryptsec}
          onChange={(e) => setNcryptsec(e.target.value)}
          multiline
          minRows={2}
          slotProps={{ htmlInput: { autoCapitalize: "none", spellCheck: false } }}
        />
        <TextField
          size="small"
          fullWidth
          label="Passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleLogin();
          }}
          autoComplete="current-password"
          autoFocus={!!ncryptsec}
        />
        <Button
          variant="contained"
          onClick={() => void handleLogin()}
          disabled={loading || !ncryptsec.trim() || !passphrase}
        >
          {loading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            "Sign in"
          )}
        </Button>
      </Stack>
    </Box>
  );
}

// ─── CreateAccountDialog ───────────────────────────────────────────────────────

function CreateAccountDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "backup">("form");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [about, setAbout] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [ncryptsec, setNcryptsec] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("form");
      setName("");
      setImageUrl("");
      setAbout("");
      setPassphrase("");
      setConfirmPassphrase("");
      setNcryptsec("");
      setError("");
      setCopied(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
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
      setConfirmPassphrase("");
      setStep("backup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ncryptsec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAcknowledge = () => {
    setNcryptsec("");
    onSuccess();
  };

  return (
    <Dialog
      open={open}
      onClose={step === "backup" ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        {step === "form" ? "Create Account" : "Back up your key"}
      </DialogTitle>

      <DialogContent>
        {step === "form" ? (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
              autoComplete="name"
            />
            <TextField
              label="Image URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              fullWidth
              size="small"
              placeholder="https://..."
              slotProps={{ htmlInput: { autoCapitalize: "none" } }}
            />
            <TextField
              label="About"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              fullWidth
              size="small"
              multiline
              minRows={2}
            />
            <TextField
              label="Passphrase"
              type={showPass ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              fullWidth
              size="small"
              helperText="Encrypts your key. Never stored."
              autoComplete="new-password"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => setShowPass((v) => !v)}
                      >
                        {showPass ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Confirm Passphrase"
              type={showPass ? "text" : "password"}
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              fullWidth
              size="small"
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Alert severity="warning">
              Save this encrypted key. Without it and your passphrase you
              cannot sign in again. It is safe to store — it is already
              encrypted with your passphrase.
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
              onClick={() => void handleCopy()}
              fullWidth
            >
              {copied ? "Copied!" : "Copy ncryptsec"}
            </Button>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === "form" ? (
          <>
            <Button onClick={onClose} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleCreate()}
              disabled={
                loading ||
                !passphrase ||
                passphrase !== confirmPassphrase
              }
            >
              {loading ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                "Create"
              )}
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            onClick={handleAcknowledge}
            fullWidth
            disabled={!copied}
          >
            I&apos;ve backed it up
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── OptionButton ──────────────────────────────────────────────────────────────

function OptionButton({
  icon,
  title,
  description,
  onClick,
  showChevron = false,
  chevronRotated = false,
  loading = false,
  disabled = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  showChevron?: boolean;
  chevronRotated?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const alpha = theme.palette.mode === "dark" ? "22" : "18";

  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled || loading}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2.5,
        py: 1.75,
        textAlign: "left",
        transition: "background 0.15s",
        "&:hover:not(:disabled)": { bgcolor: `${accent}${alpha}` },
        "&.Mui-disabled": { opacity: 0.6 },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: `${accent}${alpha}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accent,
          flexShrink: 0,
        }}
      >
        {loading ? <CircularProgress size={20} color="inherit" /> : icon}
      </Box>
      <Box flex={1} minWidth={0}>
        <Typography variant="body1" fontWeight={600} lineHeight={1.3}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {description}
        </Typography>
      </Box>
      {showChevron && (
        <ChevronRightIcon
          sx={{
            color: "text.secondary",
            opacity: 0.5,
            flexShrink: 0,
            transition: "transform 0.2s",
            transform: chevronRotated ? "rotate(90deg)" : "none",
          }}
        />
      )}
    </ButtonBase>
  );
}

// ─── LoginModal ────────────────────────────────────────────────────────────────

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  const intl = useIntl();
  const theme = useTheme();
  const [showNip46, setShowNip46] = useState(false);
  const [showNsecLogin, setShowNsecLogin] = useState(false);
  const [showNcryptsec, setShowNcryptsec] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && signerManager.getStoredNcryptsec() !== null) {
      setShowNcryptsec(true);
    }
  }, [open]);

  const handleNip07 = async () => {
    if (!window.nostr) {
      setError(intl.formatMessage({ id: "login.noNip07Extension" }));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signerManager.loginWithNip07();
      onClose();
    } catch {
      setError(intl.formatMessage({ id: "login.loginFailed" }));
    } finally {
      setLoading(false);
    }
  };

  const collapse = () => {
    setShowNip46(false);
    setShowNsecLogin(false);
    setShowNcryptsec(false);
    setError("");
  };

  return (
    <>
      <Dialog
        open={open}
        maxWidth="xs"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: "90vh",
            },
          },
        }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2,
            pb: 1.5,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              bgcolor: `${theme.palette.primary.main}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/icon.svg"
              alt="Calendar"
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                objectFit: "contain",
              }}
            />
          </Box>
          <Box textAlign="center">
            <Typography variant="h6" fontWeight={700}>
              {intl.formatMessage({ id: "login.signInToFormstr" })}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {intl.formatMessage({ id: "login.chooseLoginMethod" })}
            </Typography>
          </Box>
          {error && (
            <Alert severity="error" sx={{ width: "100%", borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </Box>

        <Stack divider={<Divider />} sx={{ overflowY: "auto", flex: 1 }}>
          {!isNative && (
            <OptionButton
              icon={<VpnKeyOutlinedIcon />}
              title={intl.formatMessage({ id: "login.signInWithExtension" })}
              description="Alby, nos2x, Flamingo"
              loading={loading}
              disabled={loading}
              onClick={() => void handleNip07()}
            />
          )}

          {isAndroidNative() && (
            <Nip55Section onClose={onClose} onError={setError} />
          )}

          {isAndroidNative() && (
            <Box>
              <OptionButton
                icon={<VpnKeyOutlinedIcon />}
                title={intl.formatMessage({ id: "login.signInWithNsec" })}
                description={intl.formatMessage({ id: "login.keysNeverLeave" })}
                onClick={() => {
                  collapse();
                  setShowNsecLogin((prev) => !prev);
                }}
                showChevron
                chevronRotated={showNsecLogin}
              />
              {showNsecLogin && (
                <NsecSection onClose={onClose} onError={setError} />
              )}
            </Box>
          )}

          <Box>
            <OptionButton
              icon={<LockOutlinedIcon />}
              title="Existing Key"
              description="Sign in with an ncryptsec"
              onClick={() => {
                collapse();
                setShowNcryptsec((prev) => !prev);
              }}
              showChevron
              chevronRotated={showNcryptsec}
            />
            {showNcryptsec && (
              <NcryptsecSection onClose={onClose} onError={setError} />
            )}
          </Box>

          <OptionButton
            icon={<PersonAddOutlinedIcon />}
            title="Create Account"
            description="Generate a new key, encrypted at rest"
            onClick={() => setShowCreateAccount(true)}
          />

          <Box>
            <OptionButton
              icon={<HubOutlinedIcon />}
              title={intl.formatMessage({ id: "login.connectRemoteSigner" })}
              description="Connect via NIP-46"
              onClick={() => {
                collapse();
                setShowNip46((prev) => !prev);
              }}
              showChevron
              chevronRotated={showNip46}
            />
            {showNip46 && (
              <Nip46Section onSuccess={onClose} onError={setError} />
            )}
          </Box>
        </Stack>

      </Dialog>

      <CreateAccountDialog
        open={showCreateAccount}
        onClose={() => setShowCreateAccount(false)}
        onSuccess={() => {
          setShowCreateAccount(false);
          onClose();
        }}
      />
    </>
  );
};

export default LoginModal;
