import React, { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { signerManager } from "../common/signer";
import { getAppSecretKeyFromLocalStorage } from "../common/signer/utils";
import { getPublicKey } from "nostr-tools";
import { createNostrConnectURI, Nip46Relays } from "../common/signer/nip46";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Stack,
  TextField,
  Typography,
  Snackbar,
  Alert,
  IconButton,
  Box,
  // Link,
} from "@mui/material";
import KeyIcon from "@mui/icons-material/VpnKey";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useIntl } from "react-intl";
import { NostrSignerPlugin } from "nostr-signer-capacitor-plugin";
import { SignerAppInfo } from "nostr-signer-capacitor-plugin/dist/esm/definitions";
import { isAndroidNative, isNative } from "../utils/platform";

// NIP-46 Section (Manual + QR)
interface Nip46SectionProps {
  onSuccess: () => void;
}

const Nip46Section: React.FC<Nip46SectionProps> = ({ onSuccess }) => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState("manual");
  const [bunkerUri, setBunkerUri] = useState("");
  const [loadingConnect, setLoadingConnect] = useState(false);

  const [qrPayload] = useState(() => generateNostrConnectURI());

  function generateNostrConnectURI() {
    const clientSecretKey = getAppSecretKeyFromLocalStorage();
    const clientPubkey = getPublicKey(clientSecretKey);

    // Required secret (short random string)
    const secret = Math.random().toString(36).slice(2, 10);

    // Permissions you want (optional, but usually good to ask explicitly)
    const perms = [
      "nip44_encrypt",
      "nip44_decrypt",
      "sign_event",
      "get_public_key",
    ];

    // Build query params
    const params = {
      clientPubkey,
      relays: Nip46Relays,
      secret,
      perms,
      name: "Calendar",
      url: window.location.origin,
    };

    const finalUrl = createNostrConnectURI(params);
    console.log("FINAL URL is", finalUrl);
    return finalUrl;
  }

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const showMessage = (
    message: string,
    severity: "success" | "error" = "success",
  ) => {
    setSnackbar({ open: true, message, severity });
  };
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const connectToBunkerUri = async (bunkerUri: string) => {
    await signerManager.loginWithNip46(bunkerUri);
    showMessage(intl.formatMessage({ id: "login.connectedToRemoteSigner" }), "success");
    onSuccess();
  };

  const handleConnectManual = async () => {
    if (!bunkerUri) {
      showMessage(intl.formatMessage({ id: "login.enterBunkerUri" }), "error");
      return;
    }
    setLoadingConnect(true);
    try {
      await connectToBunkerUri(bunkerUri);
    } catch (e) {
      console.log(e);
      showMessage(intl.formatMessage({ id: "login.connectionFailed" }), "error");
    } finally {
      setLoadingConnect(false);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Tabs
        value={activeTab}
        onChange={(_event: React.SyntheticEvent, newValue: string) => {
          setActiveTab(newValue);
          if (newValue === "qr") {
            connectToBunkerUri(qrPayload);
          }
        }}
        aria-label="NIP-46 connection tabs"
      >
        <Tab label={intl.formatMessage({ id: "login.pasteUri" })} value="manual" />
        <Tab label={intl.formatMessage({ id: "login.qrCode" })} value="qr" />
      </Tabs>
      {activeTab === "manual" && (
        <Stack spacing={2} sx={{ width: "100%", marginTop: 2 }}>
          <TextField
            placeholder={intl.formatMessage({ id: "login.enterBunkerUriPlaceholder" })}
            value={bunkerUri}
            onChange={(e) => setBunkerUri(e.target.value)}
            fullWidth
          />
          <Button
            variant="contained"
            onClick={handleConnectManual}
            disabled={loadingConnect}
          >
            {intl.formatMessage({ id: "login.connect" })}
          </Button>
        </Stack>
      )}
      {activeTab === "qr" && (
        <Box style={{ textAlign: "center", marginTop: 16 }}>
          <QRCodeCanvas value={qrPayload} size={180} />
          <Box
            color="textSecondary"
            sx={{
              fontSize: 12,
              marginTop: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <IconButton
              size="small"
              sx={{ marginTop: 1 }}
              onClick={() => {
                navigator.clipboard.writeText(qrPayload);
                showMessage(intl.formatMessage({ id: "login.copiedToClipboard" }), "success");
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
            <Typography
              color="textSecondary"
              sx={{
                fontSize: 12,
                marginTop: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {intl.formatMessage({ id: "login.copyNostrconnectUri" })}
            </Typography>
          </Box>
          <Typography color="textSecondary" sx={{ fontSize: 12, marginTop: 1 }}>
            {intl.formatMessage({ id: "login.usingRelaysForCommunication" }, { relays: Nip46Relays.map((relay) => relay.replace("wss://", "")).join(", ") })}
          </Typography>
        </Box>
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

// Footer info component
const FooterInfo: React.FC = () => {
  const intl = useIntl();
  // const [isFAQModalVisible, setIsFAQModalVisible] = useState(false);

  return (
    <div style={{ marginTop: 24, textAlign: "center", width: "100%" }}>
      <Typography color="textSecondary" sx={{ fontSize: 12 }}>
        {intl.formatMessage({ id: "login.keysNeverLeave" })}
      </Typography>
      <br />
      {/* <Link
        component="button"
        variant="body2"
        sx={{ fontSize: 12 }}
        onClick={() => {
          setIsFAQModalVisible(true);
        }}
      >
        Need help?
      </Link>
      <ThemedUniversalModal
        visible={isFAQModalVisible}
        onClose={() => {
          setIsFAQModalVisible(false);
        }}
        filePath="/docs/faq.md"
        title="Frequently Asked Questions"
      /> */}
    </div>
  );
};

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const LoginOptionButton: React.FC<{
  icon: React.ReactNode;
  text: string;
  onClick: () => void;
  type?: "outlined" | "contained";
  loading?: boolean;
}> = ({ icon, text, onClick, type, loading = false }) => (
  <Button
    variant={type}
    startIcon={icon}
    size="large"
    onClick={onClick}
    style={{ marginBottom: 8 }}
    disabled={loading}
  >
    {text}
  </Button>
);

function Nip55Section({
  onClose,
  onError,
}: {
  onClose: () => void;
  onError: (error: string) => void;
}) {
  const intl = useIntl();
  const [installedSigners, setInstalledSigners] = useState<{
    apps: SignerAppInfo[];
  }>();

  useEffect(() => {
    const initialize = async () => {
      const installedSigners = await NostrSignerPlugin.getInstalledSignerApps();
      setInstalledSigners(installedSigners);
    };
    initialize();
  }, []);
  return (
    <>
      {installedSigners?.apps.map((app) => {
        return (
          <Button
            onClick={async () => {
              try {
                await signerManager.loginWithNip55(app.packageName);
                onClose();
              } catch (e: Error) {
                onError(e.message);
              }
            }}
            startIcon={
              <img src={app.iconUrl} height={24} width={24} alt={app.name} />
            }
            variant="contained"
            fullWidth
          >
            {intl.formatMessage({ id: "login.logInWith" }, { name: app.name })}
          </Button>
        );
      })}
    </>
  );
}

const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  const intl = useIntl();
  const [showNip46, setShowNip46] = useState(false);

  const [loadingNip07, setLoadingNip07] = useState(false);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const showMessage = (
    message: string,
    severity: "success" | "error" = "success",
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleNip07 = async () => {
    console.log("handle nip07 called");
    if (window.nostr) {
      setLoadingNip07(true);
      try {
        await signerManager.loginWithNip07();
        showMessage(intl.formatMessage({ id: "login.loggedInWithNip07" }), "success");
        onClose();
      } catch {
        showMessage(intl.formatMessage({ id: "login.loginFailed" }), "error");
      } finally {
        setLoadingNip07(false);
      }
    } else {
      showMessage(intl.formatMessage({ id: "login.noNip07Extension" }), "error");
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: "center" }}>
          {intl.formatMessage({ id: "login.signInToFormstr" })}
          <Typography
            variant="body2"
            color="textSecondary"
            align="center"
            sx={{ mt: 0.5 }}
          >
            {intl.formatMessage({ id: "login.chooseLoginMethod" })}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ width: "100%" }}>
            {isAndroidNative() && (
              <Nip55Section
                onClose={onClose}
                onError={() =>
                  showMessage(intl.formatMessage({ id: "login.couldNotLogin" }), "error")
                }
              />
            )}
            {!isNative && (
              <LoginOptionButton
                icon={<KeyIcon />}
                text={intl.formatMessage({ id: "login.signInWithExtension" })}
                type="contained"
                onClick={handleNip07}
                loading={loadingNip07}
              />
            )}
            <LoginOptionButton
              icon={<LinkIcon />}
              text={intl.formatMessage({ id: "login.connectRemoteSigner" })}
              onClick={() => setShowNip46(!showNip46)}
            />
            {showNip46 && <Nip46Section onSuccess={onClose} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <FooterInfo />
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default LoginModal;
