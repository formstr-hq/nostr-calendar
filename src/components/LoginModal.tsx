import React, { useEffect, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { signerManager } from "../common/signer";
import { getAppSecretKeyFromLocalStorage } from "../common/signer/utils";
import { getPublicKey, generateSecretKey } from "nostr-tools";
import { createNostrConnectURI, Nip46Relays } from "../common/signer/nip46";
import {
  Button,
  Dialog,
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
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import PhonelinkLockOutlinedIcon from "@mui/icons-material/PhonelinkLockOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useIntl } from "react-intl";
import { bytesToHex } from "nostr-tools/utils";
import { isAndroidNative, isNative } from "../utils/platform";

const Nip46Section: React.FC<{
  onSuccess: () => void;
  onError: (msg: string) => void;
}> = ({ onSuccess, onError }) => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState("manual");
  const [bunkerUri, setBunkerUri] = useState("");
  const [loadingConnect, setLoadingConnect] = useState(false);

  const [qrPayload] = useState(() => {
    const clientSecretKey = getAppSecretKeyFromLocalStorage();
    const clientPubkey = getPublicKey(clientSecretKey);
    const secret = Math.random().toString(36).slice(2, 10);
    const perms = [
      "nip44_encrypt",
      "nip44_decrypt",
      "sign_event",
      "get_public_key",
    ];
    return createNostrConnectURI({
      clientPubkey,
      relays: Nip46Relays,
      secret,
      perms,
      name: "Calendar",
      url: window.location.origin,
    });
  });

  const connectToBunkerUri = async (uri: string) => {
    await signerManager.loginWithNip46(uri);
    onSuccess();
  };

  const handleConnectManual = async () => {
    if (!bunkerUri) {
      onError(intl.formatMessage({ id: "login.enterBunkerUri" }));
      return;
    }
    setLoadingConnect(true);
    try {
      await connectToBunkerUri(bunkerUri);
    } catch {
      onError(intl.formatMessage({ id: "login.connectionFailed" }));
    } finally {
      setLoadingConnect(false);
    }
  };

  return (
    <Box sx={{ px: 2, pb: 2, bgcolor: "action.hover" }}>
      <Tabs
        value={activeTab}
        onChange={(_e, val) => {
          setActiveTab(val);
          if (val === "qr") {
            void connectToBunkerUri(qrPayload).catch(() => {
              onError(intl.formatMessage({ id: "login.connectionFailed" }));
            });
          }
        }}
        sx={{ mb: 1 }}
      >
        <Tab
          label={intl.formatMessage({ id: "login.pasteUri" })}
          value="manual"
        />
        <Tab label={intl.formatMessage({ id: "login.qrCode" })} value="qr" />
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
            sx={{ flexShrink: 0 }}
          >
            {intl.formatMessage({ id: "login.connect" })}
          </Button>
        </Stack>
      )}

      {activeTab === "qr" && (
        <Box textAlign="center">
          <QRCodeCanvas value={qrPayload} size={160} />
          <Box display="flex" justifyContent="center" alignItems="center" mt={1}>
            <IconButton
              size="small"
              onClick={() => void navigator.clipboard.writeText(qrPayload)}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({ id: "login.copyNostrconnectUri" })}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {intl.formatMessage(
              { id: "login.usingRelaysForCommunication" },
              {
                relays: Nip46Relays.map((relay) =>
                  relay.replace("wss://", ""),
                ).join(", "),
              },
            )}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

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
          onClick={() => {
            void (async () => {
              try {
                await signerManager.loginWithNip55(app.packageName);
                onClose();
              } catch {
                onError(intl.formatMessage({ id: "login.couldNotLogin" }));
              }
            })();
          }}
        />
      ))}
    </>
  );
}

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
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
          }}
          InputProps={{
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

function OptionButton({
  icon,
  title,
  description,
  onClick,
  showChevron = false,
  chevronRotated = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  showChevron?: boolean;
  chevronRotated?: boolean;
}) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const alpha = theme.palette.mode === "dark" ? "22" : "18";

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 2,
        px: 2.5,
        py: 1.75,
        textAlign: "left",
        transition: "background 0.15s",
        "&:hover": { bgcolor: `${accent}${alpha}` },
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
        {icon}
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

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  const intl = useIntl();
  const theme = useTheme();
  const [showNip46, setShowNip46] = useState(false);
  const [showNsecLogin, setShowNsecLogin] = useState(false);
  const [error, setError] = useState("");

  const handleNip07 = async () => {
    if (!window.nostr) {
      setError(intl.formatMessage({ id: "login.noNip07Extension" }));
      return;
    }
    setError("");
    try {
      await signerManager.loginWithNip07();
      onClose();
    } catch {
      setError(intl.formatMessage({ id: "login.loginFailed" }));
    }
  };

  const handleGuest = async () => {
    setError("");
    try {
      const key = bytesToHex(generateSecretKey());
      await signerManager.createGuestAccount(key, {});
      onClose();
    } catch {
      setError(intl.formatMessage({ id: "login.loginFailed" }));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: "hidden" } }}
    >
      <Box
        sx={{
          px: 3,
          pt: 4,
          pb: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <img
          src="/formstr.png"
          alt="Calendar by Form*"
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            objectFit: "contain",
          }}
        />
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

      <Stack divider={<Divider />}>
        {!isNative && (
          <OptionButton
            icon={<VpnKeyOutlinedIcon />}
            title={intl.formatMessage({ id: "login.signInWithExtension" })}
            description="Alby, nos2x, Flamingo"
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
                setError("");
                setShowNsecLogin((prev) => !prev);
                setShowNip46(false);
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
            icon={<HubOutlinedIcon />}
            title={intl.formatMessage({ id: "login.connectRemoteSigner" })}
            description="Connect via NIP-46"
            onClick={() => {
              setError("");
              setShowNip46((prev) => !prev);
              setShowNsecLogin(false);
            }}
            showChevron
            chevronRotated={showNip46}
          />
          {showNip46 && (
            <Nip46Section onSuccess={onClose} onError={setError} />
          )}
        </Box>

        <OptionButton
          icon={<PersonOutlinedIcon />}
          title="Temporary Account"
          description="Quick access, no keys needed"
          onClick={() => void handleGuest()}
        />
      </Stack>

      <Box
        sx={{
          px: 3,
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          textAlign="center"
        >
          {intl.formatMessage({ id: "login.keysNeverLeave" })}
        </Typography>
      </Box>
    </Dialog>
  );
};

export default LoginModal;
