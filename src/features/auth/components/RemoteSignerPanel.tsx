import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";
import { signerManager } from "../../../common/signer";
import { useIntl } from "react-intl";

const defaultRelays = ["wss://relay.nsec.app", "wss://nostr.oxtr.dev"];

export function RemoteSignerPanel({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const intl = useIntl();
  const [tab, setTab] = useState("manual");
  const [bunkerUri, setBunkerUri] = useState("");
  const [relaysText, setRelaysText] = useState(defaultRelays.join("\n"));
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const relays = () =>
    relaysText
      .split(/[\n,]+/)
      .map((relay) => relay.trim())
      .filter(Boolean);
  const connect = async () => {
    setLoading(true);
    onError("");
    try {
      await signerManager.loginWithNip46(bunkerUri);
      onSuccess();
    } catch {
      onError(intl.formatMessage({ id: "login.connectionFailed" }));
    } finally {
      setLoading(false);
    }
  };
  const beginQr = () => {
    const qrRelays = relays();
    if (!qrRelays.length)
      return onError(intl.formatMessage({ id: "login.relayRequired" }));
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setLoading(true);
    setQrUri(null);
    onError("");
    void signerManager
      .loginWithNostrConnectQR({
        relays: qrRelays,
        onUri: setQrUri,
        signal: abort.signal,
      })
      .then(onSuccess)
      .catch(() => {
        if (!abort.signal.aborted)
          onError(intl.formatMessage({ id: "login.connectionFailed" }));
      })
      .finally(() => setLoading(false));
  };
  const changeTab = (value: string) => {
    setTab(value);
    if (value === "qr") beginQr();
    else {
      abortRef.current?.abort();
      setQrUri(null);
    }
  };
  return (
    <Box
      sx={{ px: { xs: 2.5, sm: 4 }, pb: 3, pt: 0.5, bgcolor: "action.hover" }}
    >
      <Stack spacing={1.5}>
        <TextField
          label={intl.formatMessage({ id: "login.relayListLabel" })}
          value={relaysText}
          onChange={(event) => setRelaysText(event.target.value)}
          multiline
          minRows={2}
          helperText={intl.formatMessage({ id: "login.relayListHint" })}
          disabled={loading}
          fullWidth
        />
        <Tabs value={tab} onChange={(_event, value) => changeTab(value)}>
          <Tab
            value="manual"
            label={intl.formatMessage({ id: "login.pasteUri" })}
            disabled={loading}
          />
          <Tab
            value="qr"
            label={intl.formatMessage({ id: "login.qrCode" })}
            disabled={loading}
          />
        </Tabs>
        {tab === "manual" ? (
          <Stack direction="row" spacing={1}>
            <TextField
              placeholder="bunker://…"
              value={bunkerUri}
              onChange={(event) => setBunkerUri(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connect();
              }}
              disabled={loading}
              fullWidth
            />
            <Button
              variant="contained"
              onClick={() => void connect()}
              disabled={!bunkerUri || loading}
            >
              {loading ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                intl.formatMessage({ id: "login.connect" })
              )}
            </Button>
          </Stack>
        ) : (
          <Box textAlign="center">
            {qrUri ? (
              <QRCodeCanvas value={qrUri} size={180} />
            ) : (
              <CircularProgress sx={{ my: 3 }} />
            )}
            <Typography variant="body2" color="text.secondary" mt={1}>
              {loading
                ? intl.formatMessage({ id: "login.waitingForConnection" })
                : intl.formatMessage({ id: "login.connectedToRemoteSigner" })}
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
