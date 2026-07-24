import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Dialog,
  Divider,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonAddOutlinedIcon from "@mui/icons-material/PersonAddOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { signerManager } from "../common/signer";
import { useUser } from "../stores/user";
import { useIntl } from "react-intl";
import { isNative } from "../utils/platform";
import { AuthOption } from "../features/auth/components/AuthOption";
import { CreateAccountFlow } from "../features/auth/components/CreateAccountFlow";
import { NativeNsecPanel } from "../features/auth/components/NativeNsecPanel";
import { NcryptsecPanel } from "../features/auth/components/NcryptsecPanel";
import { RemoteSignerPanel } from "../features/auth/components/RemoteSignerPanel";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}
type Panel = "ncryptsec" | "nsec" | "nip46" | null;

const LoginModal: React.FC<LoginModalProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const intl = useIntl();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [panel, setPanel] = useState<Panel>(null);
  const [screen, setScreen] = useState<"list" | "create">("list");
  const [error, setError] = useState("");
  const [nip07Loading, setNip07Loading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPanel(null);
      setScreen("list");
      setError("");
      return;
    }
    if (signerManager.getStoredNcryptsec()) setPanel("ncryptsec");
  }, [open]);

  const toggle = (next: Panel) => {
    setError("");
    setPanel((current) => (current === next ? null : next));
  };
  const loginNip07 = async () => {
    if (!window.nostr)
      return setError(intl.formatMessage({ id: "login.noNip07Extension" }));
    setNip07Loading(true);
    setError("");
    try {
      await signerManager.loginWithNip07();
      onClose();
    } catch {
      setError(intl.formatMessage({ id: "login.loginFailed" }));
    } finally {
      setNip07Loading(false);
    }
  };
  const success = () => {
    // SignerManager notifies the store during login. Set the immediately
    // available cached user as well so a slow store listener cannot briefly
    // re-open the modal after a successful interactive login.
    const user = signerManager.getUser();
    if (user) useUser.getState().updateUser(user);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={screen === "create" ? undefined : onClose}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? 0 : 2.5,
            overflow: "hidden",
            maxHeight: fullScreen ? undefined : "90vh",
          },
        },
      }}
    >
      {screen === "create" ? (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2,
              pt: 1.5,
            }}
          >
            <IconButton
              onClick={() => setScreen("list")}
              aria-label={intl.formatMessage({ id: "login.back" })}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography fontWeight={800}>
              {intl.formatMessage({ id: "login.createAccount" })}
            </Typography>
          </Box>
          <CreateAccountFlow
            onBack={() => setScreen("list")}
            onSuccess={success}
          />
        </>
      ) : (
        <>
          <Box sx={{ position: "absolute", right: 8, top: 8, zIndex: 1 }}>
            <IconButton
              onClick={onClose}
              aria-label={intl.formatMessage({ id: "login.closeSignIn" })}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <Box
            sx={{ px: 4, pt: { xs: 5, sm: 4.5 }, pb: 3, textAlign: "center" }}
          >
            <Box
              component="img"
              src="/icon.svg"
              alt={intl.formatMessage({ id: "login.calendarAlt" })}
              sx={{ width: 56, height: 56, borderRadius: 2, mb: 2 }}
            />
            <Typography variant="h6" fontWeight={800}>
              {intl.formatMessage({ id: "login.signInToFormstr" })}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.75}>
              {intl.formatMessage({ id: "login.chooseLoginMethod" })}
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mt: 2, textAlign: "left" }}>
                {error}
              </Alert>
            )}
          </Box>
          <Stack divider={<Divider />} sx={{ overflowY: "auto" }}>
            {!isNative && (
              <AuthOption
                icon={<VpnKeyOutlinedIcon />}
                title={intl.formatMessage({ id: "login.signInWithExtension" })}
                description={intl.formatMessage({ id: "login.nip07Providers" })}
                onClick={() => void loginNip07()}
                loading={nip07Loading}
                disabled={nip07Loading}
              />
            )}
            {isNative && (
              <Box>
                <AuthOption
                  icon={<VpnKeyOutlinedIcon />}
                  title={intl.formatMessage({ id: "login.signInWithNsec" })}
                  description={intl.formatMessage({
                    id: "login.keysNeverLeave",
                  })}
                  onClick={() => toggle("nsec")}
                  expanded={panel === "nsec"}
                  testId="login-btn-nsec"
                />
                {panel === "nsec" && (
                  <NativeNsecPanel onSuccess={success} onError={setError} />
                )}
              </Box>
            )}
            <Box>
              <AuthOption
                icon={<LockOutlinedIcon />}
                title={intl.formatMessage({ id: "login.existingKey" })}
                description={intl.formatMessage({
                  id: "login.existingKeyDescription",
                })}
                onClick={() => toggle("ncryptsec")}
                expanded={panel === "ncryptsec"}
              />
              {panel === "ncryptsec" && (
                <NcryptsecPanel onSuccess={success} onError={setError} />
              )}
            </Box>
            <AuthOption
              icon={<PersonAddOutlinedIcon />}
              title={intl.formatMessage({ id: "login.createAccount" })}
              description={intl.formatMessage({
                id: "login.createAccountDescription",
              })}
              onClick={() => {
                setError("");
                setScreen("create");
              }}
            />
            <Box>
              <AuthOption
                icon={<HubOutlinedIcon />}
                title={intl.formatMessage({ id: "login.connectRemoteSigner" })}
                description={intl.formatMessage({
                  id: "login.connectRemoteSigner",
                })}
                onClick={() => toggle("nip46")}
                expanded={panel === "nip46"}
              />
              {panel === "nip46" && (
                <RemoteSignerPanel onSuccess={success} onError={setError} />
              )}
            </Box>
          </Stack>
        </>
      )}
    </Dialog>
  );
};

export default LoginModal;
