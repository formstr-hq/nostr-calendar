import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { defaultRelays, getRelays } from "../../common/relayConfig";
import { publishRelayList } from "../../nostr/relays";
import { useRelayStore } from "../../stores/relays";
import { SettingsCard } from "./components/SettingsCard";

export function RelaySettingsPage() {
  const intl = useIntl();
  const storeRelays = useRelayStore((state) => state.relays);
  const [relays, setRelays] = useState<string[]>([]);
  const [newRelay, setNewRelay] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  useEffect(() => {
    setRelays([...getRelays()]);
  }, [storeRelays]);

  const addRelay = () => {
    const url = newRelay.trim();
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setNotice({
        message: intl.formatMessage({ id: "relay.relayUrlError" }),
        severity: "error",
      });
      return;
    }
    if (relays.includes(url)) {
      setNotice({
        message: intl.formatMessage({ id: "relay.relayAlreadyInList" }),
        severity: "error",
      });
      return;
    }
    setRelays((current) => [...current, url]);
    setNewRelay("");
  };

  const save = async () => {
    if (!relays.length) return;
    setSaving(true);
    useRelayStore.getState().setRelays(relays);
    try {
      await publishRelayList(relays);
      setNotice({
        message: intl.formatMessage({ id: "relay.relaySavedAndPublished" }),
        severity: "success",
      });
    } catch (error) {
      console.error("Failed to publish relay list", error);
      setNotice({
        message: intl.formatMessage({
          id: "relay.savedLocallyFailedPublish",
        }),
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Typography variant="h5" fontWeight={800}>
        {intl.formatMessage({ id: "settings.relays" })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {intl.formatMessage({ id: "settings.relaysDescription" })}
      </Typography>
      <SettingsCard
        label={intl.formatMessage({ id: "settings.connectedRelays" })}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 1,
            py: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="wss://relay.example.com"
            value={newRelay}
            onChange={(event) => setNewRelay(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addRelay();
              }
            }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addRelay}
          >
            {intl.formatMessage({ id: "navigation.add" })}
          </Button>
        </Box>

        <List disablePadding>
          {relays.map((relay) => (
            <ListItem
              key={relay}
              data-testid="relay-row"
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="remove relay"
                  onClick={() =>
                    setRelays((current) =>
                      current.filter((value) => value !== relay),
                    )
                  }
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
              sx={{
                mb: 0.5,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              <ListItemText
                primary={relay}
                primaryTypographyProps={{
                  variant: "body2",
                  sx: { overflowWrap: "anywhere" },
                }}
              />
            </ListItem>
          ))}
        </List>
        {!relays.length && (
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center"
            sx={{ py: 2 }}
          >
            {intl.formatMessage({ id: "relay.noRelaysConfigured" })}
          </Typography>
        )}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            gap: 1,
            mt: 2,
          }}
        >
          <Button color="inherit" onClick={() => setRelays([...defaultRelays])}>
            {intl.formatMessage({ id: "relay.resetToDefaults" })}
          </Button>
          <Button
            variant="contained"
            disabled={saving || !relays.length}
            onClick={save}
          >
            {saving
              ? intl.formatMessage({ id: "event.saving" })
              : intl.formatMessage({ id: "navigation.save" })}
          </Button>
        </Box>
      </SettingsCard>
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
      >
        <Alert
          severity={notice?.severity ?? "success"}
          onClose={() => setNotice(null)}
        >
          {notice?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
